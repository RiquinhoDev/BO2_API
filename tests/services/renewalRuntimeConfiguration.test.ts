import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import {
  isAutoExecuteEnabled,
  isMasterEnabled,
  isProcessRefundsEnabled,
  isWriteDatesEnabled,
  isWriteTagsEnabled,
} from '../../src/services/renewal/renewalAcSync.service'
import {
  getMessageChannels,
  isMessagesEnabled,
  isRolesAutoExecuteEnabled,
  isRolesSyncEnabled,
} from '../../src/services/renewal/discordRolesSync.service'
import { isScheduledMessagesEnabled } from '../../src/services/renewal/discordScheduledMessages.service'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const ENV_KEYS = [
  'RENEWAL_AC_SYNC_ENABLED',
  'RENEWAL_AC_WRITE_DATES',
  'RENEWAL_AC_WRITE_TAGS',
  'RENEWAL_AC_PROCESS_REFUNDS',
  'RENEWAL_AC_AUTO_EXECUTE',
  'DISCORD_ROLES_SYNC_ENABLED',
  'DISCORD_ROLES_AUTO_EXECUTE',
  'DISCORD_MESSAGES_ENABLED',
  'DISCORD_SCHEDULED_MESSAGES_ENABLED',
  'DISCORD_MESSAGE_CHANNELS',
] as const

const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  resetRuntimeConfigForTests()
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key]
    if (originalValue === undefined) delete process.env[key]
    else process.env[key] = originalValue
  }
})

test('renewal switches read the immutable runtime config instead of ambient env', () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    renewal: {
      ...base.renewal,
      acSyncEnabled: true,
      writeDatesEnabled: true,
      writeTagsEnabled: true,
      processRefundsEnabled: true,
      autoExecute: true,
      discordRolesSyncEnabled: true,
      discordRolesAutoExecute: true,
      discordMessagesEnabled: true,
      discordScheduledMessagesEnabled: true,
      discordMessageChannels: ['123456789012345678:alerts'],
    },
  })

  for (const key of ENV_KEYS) process.env[key] = 'false'
  process.env.DISCORD_MESSAGE_CHANNELS = '999999999999999999:ambient'

  expect({
    acSync: isMasterEnabled(),
    dates: isWriteDatesEnabled(),
    tags: isWriteTagsEnabled(),
    refunds: isProcessRefundsEnabled(),
    acAuto: isAutoExecuteEnabled(),
    roles: isRolesSyncEnabled(),
    rolesAuto: isRolesAutoExecuteEnabled(),
    messages: isMessagesEnabled(),
    scheduledMessages: isScheduledMessagesEnabled(),
  }).toEqual({
    acSync: true,
    dates: true,
    tags: true,
    refunds: true,
    acAuto: true,
    roles: true,
    rolesAuto: true,
    messages: true,
    scheduledMessages: true,
  })
  expect(getMessageChannels()).toEqual([
    { channelId: '123456789012345678', name: 'alerts' },
  ])
})
