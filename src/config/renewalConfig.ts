import type { IntegrationConfigs, RenewalConfig } from './configTypes'
import { parseBooleanFlag, parseBoundedInteger, readOptionalString } from './configPrimitives'

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

export function parseRenewal(env: NodeJS.ProcessEnv, integrations: IntegrationConfigs): RenewalConfig {
  const acSyncEnabled = parseBooleanFlag(env.RENEWAL_AC_SYNC_ENABLED, 'RENEWAL_AC_SYNC_ENABLED')
  const manualExecutionEnabled = parseBooleanFlag(
    env.RENEWAL_AC_MANUAL_EXECUTION_ENABLED,
    'RENEWAL_AC_MANUAL_EXECUTION_ENABLED',
  )
  const offerManualExecutionEnabled = parseBooleanFlag(
    env.RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED,
    'RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED',
  )
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
  const hotmartOgiProductId = readOptionalString(env, 'HOTMART_OGI_PRODUCT_ID')

  const discordRolesSyncEnabled = parseBooleanFlag(
    env.DISCORD_ROLES_SYNC_ENABLED,
    'DISCORD_ROLES_SYNC_ENABLED',
  )
  const discordRolesAutoExecute = parseBooleanFlag(
    env.DISCORD_ROLES_AUTO_EXECUTE,
    'DISCORD_ROLES_AUTO_EXECUTE',
  )
  const discordRolesManualExecutionEnabled = parseBooleanFlag(env.DISCORD_ROLES_MANUAL_EXECUTION_ENABLED, 'DISCORD_ROLES_MANUAL_EXECUTION_ENABLED')
  const discordMessagesEnabled = parseBooleanFlag(
    env.DISCORD_MESSAGES_ENABLED,
    'DISCORD_MESSAGES_ENABLED',
  )
  const discordScheduledMessagesEnabled = parseBooleanFlag(env.DISCORD_SCHEDULED_MESSAGES_ENABLED, 'DISCORD_SCHEDULED_MESSAGES_ENABLED')
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

  if (offerManualExecutionEnabled && !integrations.hotmart.configured) {
    throw new Error(
      'CONFIG_INVALIDA: RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart completas',
    )
  }

  if (
    (discordRolesSyncEnabled ||
      discordRolesManualExecutionEnabled ||
      discordRolesAutoExecute ||
      discordMessagesEnabled ||
      discordScheduledMessagesEnabled) &&
    !integrations.discord.configured
  ) {
    throw new Error('CONFIG_INVALIDA: DISCORD_BOT_URL e obrigatorio para renewal')
  }

  if (
    (discordRolesSyncEnabled || discordRolesManualExecutionEnabled || discordRolesAutoExecute || discordMessagesEnabled || discordScheduledMessagesEnabled) &&
    integrations.discord.configured &&
    !integrations.discord.value.sharedSecret
  ) {
    throw new Error('CONFIG_INVALIDA: BOT_SHARED_SECRET e obrigatorio para renewal')
  }

  return {
    acSyncEnabled,
    manualExecutionEnabled,
    offerManualExecutionEnabled,
    writeDatesEnabled,
    writeTagsEnabled,
    processRefundsEnabled,
    autoExecute,
    expiryFieldId,
    maxChangesPerRun,
    ...(hotmartOgiProductId ? { hotmartOgiProductId } : {}),
    discordRolesSyncEnabled,
    discordRolesAutoExecute,
    discordRolesManualExecutionEnabled,
    discordMessagesEnabled,
    discordScheduledMessagesEnabled,
    discordRolesMaxOpsPerRun,
    ...(discordMessageChannelId ? { discordMessageChannelId } : {}),
    discordMessageChannels,
  }
}
