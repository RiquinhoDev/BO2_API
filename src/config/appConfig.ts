import { buildAllowedOrigins } from '../security/cors'
import { freezeRecursively } from './runtimeConfig'
import { parseHotmartSyncManualExecutionEnabled } from './hotmartSyncConfig'
import { parseCurseducaSyncManualExecutionEnabled } from './curseducaSyncConfig'
import { parseAllSyncManualExecutionEnabled } from './allSyncConfig'
import type {
  ActiveCampaignIntegration,
  AppConfig,
  ClarezaIntegration,
  CurseducaIntegration,
  DiscordIntegration,
  FmpIntegration,
  HotmartIntegration,
  IntegrationConfig,
  IntegrationConfigs,
  LegacyApiIntegration,
  NodeEnvironment,
  ObservabilityConfig,
  RedisConfig,
  SlackIntegration,
  StudentSummaryIntegration,
} from './configTypes'
export type { AppConfig } from './configTypes'
import {
  configuredCredentialGroup,
  DEFAULT_LOG_DIRECTORY,
  hasAnyValue,
  LOG_LEVELS,
  parseBooleanFlag,
  parseOptionalUrl,
  parsePort,
  parseRequiredUrl,
  parseStrongSecret,
  readOptionalString
} from './configPrimitives'
import { parseGuru, parseGuruTrialManualExecutionEnabled } from './guruTrialConfig'
import { parseRenewal } from './renewalConfig'
export {
  configuredCredentialGroup,
  parseBooleanFlag,
  parseBoundedInteger,
  parseOptionalUrl,
  parsePort,
  parseRequiredUrl,
  parseStrongSecret
} from './configPrimitives'
export type { BoundedIntegerOptions } from './configPrimitives'
function parseActiveCampaign(
  env: NodeJS.ProcessEnv,
  webhookSecret: string,
): IntegrationConfig<ActiveCampaignIntegration> {
  const debugEnabled = parseBooleanFlag(env.AC_DEBUG, 'AC_DEBUG')
  const verifyDeleteEnabled = parseBooleanFlag(env.AC_DEBUG_VERIFY_DELETE, 'AC_DEBUG_VERIFY_DELETE')
  const tagApplyEnabled = parseBooleanFlag(env.AC_TAG_APPLY_ENABLED, 'AC_TAG_APPLY_ENABLED')
  const names = ['AC_API_URL', 'AC_API_KEY', 'AC_LIST_CLAREZA', 'AC_LIST_OGI'] as const
  if (!hasAnyValue(env, names)) {
    if (tagApplyEnabled) {
      throw new Error(
        'CONFIG_INVALIDA: AC_TAG_APPLY_ENABLED requer credenciais ActiveCampaign completas',
      )
    }
    return { configured: false }
  }
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
      debugEnabled,
      verifyDeleteEnabled,
      tagApplyEnabled,
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
  const configuredNames = [
    ...credentialNames,
    'HOTMART_SUBDOMAIN',
    'COURSE_LESSON_SUBDOMAIN',
    'COURSE_LESSON_SYNC_USER_ID',
    'subdomain',
  ] as const
  if (!hasAnyValue(env, configuredNames)) return { configured: false }

  const subdomain =
    readOptionalString(env, 'COURSE_LESSON_SUBDOMAIN')
    || readOptionalString(env, 'HOTMART_SUBDOMAIN')
    || readOptionalString(env, 'subdomain')
  const syncUserId = readOptionalString(env, 'COURSE_LESSON_SYNC_USER_ID')

  const group = configuredCredentialGroup(env, credentialNames, (values) => ({
    clientId: values.HOTMART_CLIENT_ID,
    clientSecret: values.HOTMART_CLIENT_SECRET,
    ...(subdomain ? { subdomain } : {}),
    ...(syncUserId ? { syncUserId } : {}),
  }))

  if (!group.configured) {
    throw new Error(
      'CONFIG_INVALIDA: HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET sao obrigatorios',
    )
  }
  return group
}

function parseCurseduca(env: NodeJS.ProcessEnv): IntegrationConfig<CurseducaIntegration> {
  const inactivationEnabled = parseBooleanFlag(
    env.CURSEDUCA_INACTIVATION_ENABLED,
    'CURSEDUCA_INACTIVATION_ENABLED',
  )
  const credentials = configuredCredentialGroup(
    env,
    ['CURSEDUCA_API_URL', 'CURSEDUCA_API_KEY', 'CURSEDUCA_AccessToken'],
    (values) => ({
      apiUrl: parseRequiredUrl(values.CURSEDUCA_API_URL, 'CURSEDUCA_API_URL'),
      apiKey: values.CURSEDUCA_API_KEY,
      accessToken: values.CURSEDUCA_AccessToken,
    }),
  )
  if (inactivationEnabled && !credentials.configured) {
    throw new Error(
      'CONFIG_INVALIDA: CURSEDUCA_INACTIVATION_ENABLED requer credenciais CursEduca completas',
    )
  }
  if (!credentials.configured) return credentials
  return {
    configured: true,
    value: {
      ...credentials.value,
      inactivationEnabled,
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

function parseClareza(env: NodeJS.ProcessEnv): IntegrationConfig<ClarezaIntegration> {
  const refreshToken = readOptionalString(env, 'CLAREZA_REFRESH_TOKEN')
  return refreshToken
    ? { configured: true, value: { refreshToken } }
    : { configured: false }
}

function parseLegacyApi(env: NodeJS.ProcessEnv): IntegrationConfig<LegacyApiIntegration> {
  const apiUrl = parseOptionalUrl(env.OLD_API_URL, 'OLD_API_URL')
  return apiUrl ? { configured: true, value: { apiUrl } } : { configured: false }
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
    clareza: parseClareza(env),
    legacyApi: parseLegacyApi(env),
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
    consoleLoggingEnabled: parseBooleanFlag(env.LOG_CONSOLE_ENABLED, 'LOG_CONSOLE_ENABLED', nodeEnv !== 'test'),
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
  const serverVersion = env.npm_package_version?.trim() || undefined
  const authEnforce = parseBooleanFlag(env.AUTH_ENFORCE, 'AUTH_ENFORCE', true)
  const enableDebugRoutes = parseBooleanFlag(env.ENABLE_DEBUG_ROUTES, 'ENABLE_DEBUG_ROUTES')
  const syncMutableExecutionEnabled = parseBooleanFlag(
    env.SYNC_MUTABLE_EXECUTION_ENABLED,
    'SYNC_MUTABLE_EXECUTION_ENABLED',
  )
  const cronExecutionCleanupMutableExecutionEnabled = parseBooleanFlag(
    env.CRON_EXECUTION_CLEANUP_MUTABLE_EXECUTION_ENABLED,
    'CRON_EXECUTION_CLEANUP_MUTABLE_EXECUTION_ENABLED',
  )
  const achievementEvaluationMutableExecutionEnabled = parseBooleanFlag(env.ACHIEVEMENT_EVALUATION_MUTABLE_EXECUTION_ENABLED, 'ACHIEVEMENT_EVALUATION_MUTABLE_EXECUTION_ENABLED')
  const integrations = parseIntegrations(env, acWebhookSecret)
  const guruTrialManualExecutionEnabled = parseGuruTrialManualExecutionEnabled(env, integrations.guru)
  const hotmartSyncManualExecutionEnabled = parseHotmartSyncManualExecutionEnabled(
    env,
    integrations.hotmart,
  )
  const curseducaSyncManualExecutionEnabled = parseCurseducaSyncManualExecutionEnabled(
    env,
    integrations.curseduca,
  )
  const allSyncManualExecutionEnabled = parseAllSyncManualExecutionEnabled(
    env,
    integrations.hotmart,
    integrations.curseduca,
  )
  if (nodeEnv === 'production' && enableDebugRoutes) {
    throw new Error('CONFIG_INVÁLIDA: ENABLE_DEBUG_ROUTES é proibida em produção')
  }
  const allowedOrigins = buildAllowedOrigins(env.ALLOWED_ORIGINS, nodeEnv)
  const port = parsePort(env.PORT, 3001, 'PORT')
  const redis = parseRedisConfig(env, nodeEnv)
  const observability = parseObservability(env, nodeEnv)
  const renewal = parseRenewal(env, integrations)
  const core = {
    readOnlyMode: parseBooleanFlag(env.READ_ONLY_MODE, 'READ_ONLY_MODE'),
    nodeEnv,
    ...(serverVersion !== undefined ? { serverVersion } : {}),
    mongoUri,
    jwtSecret,
    oldApiJwtSecret,
    studentAccessJwtSecret,
    acWebhookSecret,
    authEnforce,
    enableDebugRoutes,
    syncMutableExecutionEnabled,
    cronExecutionCleanupMutableExecutionEnabled,
    achievementEvaluationMutableExecutionEnabled,
    guruTrialManualExecutionEnabled,
    hotmartSyncManualExecutionEnabled,
    curseducaSyncManualExecutionEnabled,
    allSyncManualExecutionEnabled,
    weeklyTagSnapshotMutableExecutionEnabled: parseBooleanFlag(
      env.WEEKLY_TAG_SNAPSHOT_MUTABLE_EXECUTION_ENABLED,
      'WEEKLY_TAG_SNAPSHOT_MUTABLE_EXECUTION_ENABLED',
    ),
    allowedOrigins,
    port,
  }
  const config: AppConfig = {
    operationalControls: {
      clarezaCanonicalEnabled: parseBooleanFlag(env.CLAREZA_CANONICAL_ENABLED, 'CLAREZA_CANONICAL_ENABLED'),
      clarezaRefreshEnabled: parseBooleanFlag(env.CLAREZA_REFRESH_ENABLED, 'CLAREZA_REFRESH_ENABLED'),
      clarezaFmpEgressEnabled: parseBooleanFlag(env.CLAREZA_FMP_EGRESS_ENABLED, 'CLAREZA_FMP_EGRESS_ENABLED'),
    },
    ...core,
    core,
    ...(redis ? { redis } : {}),
    observability,
    integrations,
    renewal,
  }

  return freezeRecursively(config)
}
