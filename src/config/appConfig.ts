import { buildAllowedOrigins } from '../security/cors'
import { freezeRecursively } from './runtimeConfig'
import type {
  ActiveCampaignIntegration,
  AppConfig,
  CurseducaIntegration,
  DiscordIntegration,
  FmpIntegration,
  GuruIntegration,
  HotmartIntegration,
  IntegrationConfig,
  IntegrationConfigs,
  NodeEnvironment,
  ObservabilityConfig,
  RedisConfig,
  RenewalConfig,
  SlackIntegration,
  StudentSummaryIntegration,
} from './configTypes'

export type { AppConfig } from './configTypes'

export interface BoundedIntegerOptions {
  readonly min?: number
  readonly max?: number
  readonly defaultValue?: number
}

const DEFAULT_LOG_DIRECTORY = 'logs'
const LOG_LEVELS = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])

export function parseBooleanFlag(
  value: string | undefined,
  name: string,
  fallback = false,
): boolean {
  if (value === undefined) return fallback

  const normalized = value.trim()
  if (normalized === 'false') return false
  if (normalized === 'true') return true

  throw new Error(`CONFIG_INVÁLIDA: ${name} deve ser true ou false`)
}

export function parseBoundedInteger(
  value: string | undefined,
  name: string,
  options: BoundedIntegerOptions = {},
): number {
  const min = options.min ?? Number.MIN_SAFE_INTEGER
  const max = options.max ?? Number.MAX_SAFE_INTEGER

  if (value === undefined) {
    if (options.defaultValue !== undefined) return options.defaultValue
    throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  }

  const normalized = value.trim()
  const parsed = Number(normalized)
  if (
    normalized === '' ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`CONFIG_INVALIDA: ${name} deve ser um inteiro entre ${min} e ${max}`)
  }

  return parsed
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ser uma porta entre 1 e 65535`)
  }
  return port
}

export function parseOptionalUrl(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined

  const normalized = value.trim()
  if (!normalized) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)

  try {
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('unsupported URL')
    }
    return parsed.toString()
  } catch {
    throw new Error(`CONFIG_INVALIDA: ${name} deve ser um URL HTTP(S) valido`)
  }
}

export function parseRequiredUrl(value: string | undefined, name: string): string {
  const parsed = parseOptionalUrl(value, name)
  if (!parsed) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  return parsed
}

export function parseStrongSecret(value: string | undefined, name: string, required: true): string
export function parseStrongSecret(
  value: string | undefined,
  name: string,
  required: false,
): string | undefined
export function parseStrongSecret(
  value: string | undefined,
  name: string,
  required = true,
): string | undefined {
  if (value === undefined) {
    if (required) throw new Error(`CONFIG_INVÁLIDA: ${name} é obrigatória`)
    return undefined
  }

  const secret = value.trim()
  if (!secret) throw new Error(`CONFIG_INVÁLIDA: ${name} é obrigatória`)
  if (secret.length < 32) {
    throw new Error(`CONFIG_INVÁLIDA: ${name} deve ter pelo menos 32 caracteres`)
  }
  return secret
}

function readOptionalString(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]
  if (value === undefined) return undefined

  const normalized = value.trim()
  if (!normalized) throw new Error(`CONFIG_INVALIDA: ${name} e obrigatorio`)
  return normalized
}

function hasAnyValue(env: NodeJS.ProcessEnv, names: readonly string[]): boolean {
  return names.some((name) => env[name] !== undefined)
}

export function configuredCredentialGroup<T extends object>(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  build: (values: Record<string, string>) => T,
): IntegrationConfig<T> {
  if (!hasAnyValue(env, names)) return { configured: false }

  const values: Record<string, string> = {}
  const missing: string[] = []
  for (const name of names) {
    const value = env[name]
    if (value === undefined || !value.trim()) {
      missing.push(name)
    } else {
      values[name] = value.trim()
    }
  }

  if (missing.length > 0) {
    throw new Error(`CONFIG_INVALIDA: credenciais incompletas (${missing.join(', ')})`)
  }

  return { configured: true, value: build(values) }
}

function parseActiveCampaign(
  env: NodeJS.ProcessEnv,
  webhookSecret: string,
): IntegrationConfig<ActiveCampaignIntegration> {
  const names = ['AC_API_URL', 'AC_API_KEY', 'AC_LIST_CLAREZA', 'AC_LIST_OGI'] as const
  if (!hasAnyValue(env, names)) return { configured: false }

  const apiUrl = parseRequiredUrl(env.AC_API_URL, 'AC_API_URL')
  const apiKey = readOptionalString(env, 'AC_API_KEY')
  if (!apiKey) throw new Error('CONFIG_INVALIDA: AC_API_KEY e obrigatorio')
  const clarezaList = readOptionalString(env, 'AC_LIST_CLAREZA')
  const ogiList = readOptionalString(env, 'AC_LIST_OGI')

  return {
    configured: true,
    value: {
      apiUrl,
      apiKey,
      webhookSecret,
      lists: {
        ...(clarezaList !== undefined ? { clareza: clarezaList } : {}),
        ...(ogiList !== undefined ? { ogi: ogiList } : {}),
      },
    },
  }
}

function parseFmp(env: NodeJS.ProcessEnv): IntegrationConfig<FmpIntegration> {
  const apiKey = readOptionalString(env, 'FMP_API_KEY')
  return apiKey ? { configured: true, value: { apiKey } } : { configured: false }
}

function parseHotmart(env: NodeJS.ProcessEnv): IntegrationConfig<HotmartIntegration> {
  const credentialNames = ['HOTMART_CLIENT_ID', 'HOTMART_CLIENT_SECRET'] as const
  const configuredNames = [...credentialNames, 'HOTMART_SUBDOMAIN'] as const
  if (!hasAnyValue(env, configuredNames)) return { configured: false }

  const group = configuredCredentialGroup(env, credentialNames, (values) => ({
    clientId: values.HOTMART_CLIENT_ID,
    clientSecret: values.HOTMART_CLIENT_SECRET,
    ...(readOptionalString(env, 'HOTMART_SUBDOMAIN')
      ? { subdomain: readOptionalString(env, 'HOTMART_SUBDOMAIN') }
      : {}),
  }))

  if (!group.configured) {
    throw new Error(
      'CONFIG_INVALIDA: HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET sao obrigatorios',
    )
  }
  return group
}

function parseCurseduca(env: NodeJS.ProcessEnv): IntegrationConfig<CurseducaIntegration> {
  return configuredCredentialGroup(
    env,
    ['CURSEDUCA_API_URL', 'CURSEDUCA_API_KEY', 'CURSEDUCA_AccessToken'],
    (values) => ({
      apiUrl: parseRequiredUrl(values.CURSEDUCA_API_URL, 'CURSEDUCA_API_URL'),
      apiKey: values.CURSEDUCA_API_KEY,
      accessToken: values.CURSEDUCA_AccessToken,
    }),
  )
}

function parseGuru(env: NodeJS.ProcessEnv): IntegrationConfig<GuruIntegration> {
  const names = ['GURU_USER_TOKEN', 'GURU_ACCOUNT_TOKEN'] as const
  if (!hasAnyValue(env, names)) return { configured: false }

  return {
    configured: true,
    value: {
      ...(readOptionalString(env, 'GURU_USER_TOKEN')
        ? { userToken: readOptionalString(env, 'GURU_USER_TOKEN') }
        : {}),
      ...(readOptionalString(env, 'GURU_ACCOUNT_TOKEN')
        ? { accountToken: readOptionalString(env, 'GURU_ACCOUNT_TOKEN') }
        : {}),
    },
  }
}

function parseDiscord(env: NodeJS.ProcessEnv): IntegrationConfig<DiscordIntegration> {
  const names = [
    'DISCORD_BOT_URL',
    'BOT_SHARED_SECRET',
    'DISCORD_MESSAGE_CHANNEL_ID',
    'DISCORD_MESSAGE_CHANNELS',
  ] as const
  if (!hasAnyValue(env, names)) return { configured: false }

  const botUrl = parseRequiredUrl(env.DISCORD_BOT_URL, 'DISCORD_BOT_URL')
  const channelId = readOptionalString(env, 'DISCORD_MESSAGE_CHANNEL_ID')
  if (channelId && !/^\d+$/.test(channelId)) {
    throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNEL_ID deve conter apenas digitos')
  }

  const channelsValue = readOptionalString(env, 'DISCORD_MESSAGE_CHANNELS')
  const messageChannels = channelsValue
    ? channelsValue.split(',').map((entry) => {
        const [id, ...nameParts] = entry.split(':')
        if (!/^\d+$/.test(id.trim()) || nameParts.length === 0 || !nameParts.join(':').trim()) {
          throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNELS contem entrada invalida')
        }
        return `${id.trim()}:${nameParts.join(':').trim()}`
      })
    : []

  return {
    configured: true,
    value: {
      botUrl,
      ...(readOptionalString(env, 'BOT_SHARED_SECRET')
        ? { sharedSecret: readOptionalString(env, 'BOT_SHARED_SECRET') }
        : {}),
      ...(channelId ? { messageChannelId: channelId } : {}),
      messageChannels,
    },
  }
}

function parseSlack(env: NodeJS.ProcessEnv): IntegrationConfig<SlackIntegration> {
  const webhookUrl = parseOptionalUrl(env.SLACK_WEBHOOK_URL, 'SLACK_WEBHOOK_URL')
  return webhookUrl ? { configured: true, value: { webhookUrl } } : { configured: false }
}

function parseStudentSummary(
  env: NodeJS.ProcessEnv,
): IntegrationConfig<StudentSummaryIntegration> {
  const token = readOptionalString(env, 'STUDENT_SUMMARY_TOKEN')
  return token ? { configured: true, value: { token } } : { configured: false }
}

function parseIntegrations(
  env: NodeJS.ProcessEnv,
  webhookSecret: string,
): IntegrationConfigs {
  return {
    activeCampaign: parseActiveCampaign(env, webhookSecret),
    fmp: parseFmp(env),
    hotmart: parseHotmart(env),
    curseduca: parseCurseduca(env),
    guru: parseGuru(env),
    discord: parseDiscord(env),
    slack: parseSlack(env),
    studentSummary: parseStudentSummary(env),
  }
}

function parseDiscordChannelId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!normalized) throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNEL_ID e obrigatorio')
  if (!/^\d+$/.test(normalized)) {
    throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNEL_ID deve conter apenas digitos')
  }
  return normalized
}

function parseMessageChannels(value: string | undefined): readonly string[] {
  if (value === undefined) return []
  const normalized = value.trim()
  if (!normalized) throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNELS e obrigatorio')

  return normalized.split(',').map((entry) => {
    const [id, ...nameParts] = entry.split(':')
    if (!/^\d+$/.test(id.trim()) || nameParts.length === 0 || !nameParts.join(':').trim()) {
      throw new Error('CONFIG_INVALIDA: DISCORD_MESSAGE_CHANNELS contem entrada invalida')
    }
    return `${id.trim()}:${nameParts.join(':').trim()}`
  })
}

function parseRenewal(env: NodeJS.ProcessEnv, integrations: IntegrationConfigs): RenewalConfig {
  const acSyncEnabled = parseBooleanFlag(env.RENEWAL_AC_SYNC_ENABLED, 'RENEWAL_AC_SYNC_ENABLED')
  const writeDatesEnabled = parseBooleanFlag(env.RENEWAL_AC_WRITE_DATES, 'RENEWAL_AC_WRITE_DATES')
  const writeTagsEnabled = parseBooleanFlag(env.RENEWAL_AC_WRITE_TAGS, 'RENEWAL_AC_WRITE_TAGS')
  const processRefundsEnabled = parseBooleanFlag(
    env.RENEWAL_AC_PROCESS_REFUNDS,
    'RENEWAL_AC_PROCESS_REFUNDS',
  )
  const autoExecute = parseBooleanFlag(env.RENEWAL_AC_AUTO_EXECUTE, 'RENEWAL_AC_AUTO_EXECUTE')
  const expiryFieldId = parseBoundedInteger(env.RENEWAL_AC_EXPIRY_FIELD_ID, 'RENEWAL_AC_EXPIRY_FIELD_ID', {
    min: 1,
    max: 1_000_000,
    defaultValue: 332,
  })
  const maxChangesPerRun = parseBoundedInteger(
    env.RENEWAL_AC_MAX_CHANGES_PER_RUN,
    'RENEWAL_AC_MAX_CHANGES_PER_RUN',
    { min: 1, max: 10_000, defaultValue: 50 },
  )

  const discordRolesSyncEnabled = parseBooleanFlag(
    env.DISCORD_ROLES_SYNC_ENABLED,
    'DISCORD_ROLES_SYNC_ENABLED',
  )
  const discordRolesAutoExecute = parseBooleanFlag(
    env.DISCORD_ROLES_AUTO_EXECUTE,
    'DISCORD_ROLES_AUTO_EXECUTE',
  )
  const discordMessagesEnabled = parseBooleanFlag(
    env.DISCORD_MESSAGES_ENABLED,
    'DISCORD_MESSAGES_ENABLED',
  )
  const discordScheduledMessagesEnabled = parseBooleanFlag(
    env.DISCORD_SCHEDULED_MESSAGES_ENABLED,
    'DISCORD_SCHEDULED_MESSAGES_ENABLED',
  )
  const discordRolesMaxOpsPerRun = parseBoundedInteger(
    env.DISCORD_ROLES_MAX_OPS_PER_RUN,
    'DISCORD_ROLES_MAX_OPS_PER_RUN',
    { min: 1, max: 10_000, defaultValue: 100 },
  )
  const discordMessageChannelId = parseDiscordChannelId(env.DISCORD_MESSAGE_CHANNEL_ID)
  const discordMessageChannels = parseMessageChannels(env.DISCORD_MESSAGE_CHANNELS)

  if (
    (acSyncEnabled || writeDatesEnabled || writeTagsEnabled || autoExecute) &&
    !integrations.activeCampaign.configured
  ) {
    throw new Error('CONFIG_INVALIDA: AC_API_URL e AC_API_KEY sao obrigatorios para renewal')
  }

  if (processRefundsEnabled && !integrations.hotmart.configured) {
    throw new Error(
      'CONFIG_INVALIDA: HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET sao obrigatorios para renewal',
    )
  }

  if (
    (discordRolesSyncEnabled ||
      discordRolesAutoExecute ||
      discordMessagesEnabled ||
      discordScheduledMessagesEnabled) &&
    !integrations.discord.configured
  ) {
    throw new Error('CONFIG_INVALIDA: DISCORD_BOT_URL e obrigatorio para renewal')
  }

  if (
    (discordRolesSyncEnabled || discordRolesAutoExecute || discordMessagesEnabled || discordScheduledMessagesEnabled) &&
    integrations.discord.configured &&
    !integrations.discord.value.sharedSecret
  ) {
    throw new Error('CONFIG_INVALIDA: BOT_SHARED_SECRET e obrigatorio para renewal')
  }

  return {
    acSyncEnabled,
    writeDatesEnabled,
    writeTagsEnabled,
    processRefundsEnabled,
    autoExecute,
    expiryFieldId,
    maxChangesPerRun,
    discordRolesSyncEnabled,
    discordRolesAutoExecute,
    discordMessagesEnabled,
    discordScheduledMessagesEnabled,
    discordRolesMaxOpsPerRun,
    ...(discordMessageChannelId ? { discordMessageChannelId } : {}),
    discordMessageChannels,
  }
}

function parseObservability(
  env: NodeJS.ProcessEnv,
  nodeEnv: NodeEnvironment,
): ObservabilityConfig {
  const logLevel = env.LOG_LEVEL === undefined ? 'info' : env.LOG_LEVEL.trim()
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error('CONFIG_INVALIDA: LOG_LEVEL deve ser um nivel Winston valido')
  }

  const metricsEnabled = parseBooleanFlag(env.LOG_METRICS, 'LOG_METRICS')
  const logDirectory =
    env.LOG_DIRECTORY === undefined ? DEFAULT_LOG_DIRECTORY : env.LOG_DIRECTORY.trim()
  if (!logDirectory) throw new Error('CONFIG_INVALIDA: LOG_DIRECTORY e obrigatorio')

  return {
    logLevel,
    metricsEnabled,
    logDirectory,
    fileLoggingEnabled: nodeEnv !== 'test',
    consoleLoggingEnabled: nodeEnv === 'development',
  }
}

function parseRedisConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment): RedisConfig | undefined {
  const host = env.REDIS_HOST?.trim()
  const hasOtherRedisConfig = ['REDIS_PORT', 'REDIS_USERNAME', 'REDIS_PASSWORD'].some(
    (name) => env[name] !== undefined,
  )

  if (!host) {
    if (nodeEnv === 'production') {
      throw new Error(
        'CONFIG_INVALIDA: REDIS_HOST e obrigatoria em producao para rate limiting distribuido',
      )
    }
    if (env.REDIS_HOST !== undefined || hasOtherRedisConfig) {
      throw new Error('CONFIG_INVÁLIDA: REDIS_HOST é obrigatória quando Redis é configurado')
    }
    return undefined
  }

  return {
    host,
    port: parsePort(env.REDIS_PORT, 6379, 'REDIS_PORT'),
    username: readOptionalString(env, 'REDIS_USERNAME') ?? 'default',
    ...(env.REDIS_PASSWORD !== undefined
      ? { password: readOptionalString(env, 'REDIS_PASSWORD') }
      : {}),
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = env.MONGO_URI?.trim()
  if (!mongoUri) throw new Error('CONFIG_INVÁLIDA: MONGO_URI é obrigatória')

  const jwtSecret = parseStrongSecret(env.JWT_SECRET, 'JWT_SECRET', true)
  const oldApiJwtSecret = parseStrongSecret(env.OLD_API_JWT_SECRET, 'OLD_API_JWT_SECRET', true)
  const studentAccessJwtSecret = parseStrongSecret(
    env.STUDENT_ACCESS_JWT_SECRET,
    'STUDENT_ACCESS_JWT_SECRET',
    true,
  )
  const jwtSecrets = [jwtSecret, oldApiJwtSecret, studentAccessJwtSecret]
  if (new Set(jwtSecrets).size !== jwtSecrets.length) {
    throw new Error(
      'CONFIG_INVALIDA: JWT_SECRET, OLD_API_JWT_SECRET e STUDENT_ACCESS_JWT_SECRET devem ser distintos',
    )
  }

  const acWebhookSecret = parseStrongSecret(env.AC_WEBHOOK_SECRET, 'AC_WEBHOOK_SECRET', true)
  const rawNodeEnv = env.NODE_ENV === undefined ? 'development' : env.NODE_ENV.trim()
  if (!['development', 'test', 'production'].includes(rawNodeEnv)) {
    throw new Error('CONFIG_INVÁLIDA: NODE_ENV deve ser development, test ou production')
  }
  const nodeEnv = rawNodeEnv as NodeEnvironment

  const authEnforce = parseBooleanFlag(env.AUTH_ENFORCE, 'AUTH_ENFORCE', true)
  const enableDebugRoutes = parseBooleanFlag(env.ENABLE_DEBUG_ROUTES, 'ENABLE_DEBUG_ROUTES')
  if (nodeEnv === 'production' && enableDebugRoutes) {
    throw new Error('CONFIG_INVÁLIDA: ENABLE_DEBUG_ROUTES é proibida em produção')
  }

  const allowedOrigins = buildAllowedOrigins(env.ALLOWED_ORIGINS, nodeEnv)
  const port = parsePort(env.PORT, 3001, 'PORT')
  const redis = parseRedisConfig(env, nodeEnv)
  const observability = parseObservability(env, nodeEnv)
  const integrations = parseIntegrations(env, acWebhookSecret)
  const renewal = parseRenewal(env, integrations)

  const core = {
    nodeEnv,
    mongoUri,
    jwtSecret,
    oldApiJwtSecret,
    studentAccessJwtSecret,
    acWebhookSecret,
    authEnforce,
    enableDebugRoutes,
    allowedOrigins,
    port,
  }

  const config: AppConfig = {
    ...core,
    core,
    ...(redis ? { redis } : {}),
    observability,
    integrations,
    renewal,
  }

  return freezeRecursively(config)
}
