const mockAxiosPost = jest.fn()
const mockMessageLogCreate = jest.fn()
const mockRuntimeConfig = {
  renewal: {
    discordMessagesEnabled: true,
    discordRolesSyncEnabled: false,
    discordRolesAutoExecute: false,
    discordRolesManualExecutionEnabled: false,
    discordRolesMaxOpsPerRun: 100,
    discordMessageChannelId: 'channel-1',
    discordMessageChannels: ['channel-1:Renewals'],
  },
  integrations: {
    discord: {
      configured: true,
      value: { botUrl: 'http://discord-bot', sharedSecret: 'secret' },
    },
  },
}

jest.mock('axios', () => ({
  post: mockAxiosPost,
  isAxiosError: jest.fn(() => false),
}))

jest.mock('../../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => mockRuntimeConfig,
}))

jest.mock('../../../src/models/discordRenewal', () => ({
  DiscordMessageLog: { create: mockMessageLogCreate },
  DiscordMessageTemplate: {},
  DiscordRoleChange: {},
  DiscordRoleState: {},
}))

import { sendDiscordMessage } from '../../../src/services/renewal/discord/execution'
import { performDiscordMessage } from '../../../src/services/renewal/discord/discordMessageTransport.service'
import type { DiscordMessageExecutionContext } from '../../../src/services/renewal/discord/discordMessageExecution.service'
import { ActiveCampaignExecutionOwnershipError } from '../../../src/services/activeCampaign/activeCampaignExecution.service'

const message = {
  content: 'Renova até {dataFim}',
  mentionRoleIds: ['1525119563182772385'],
  dataFim: '31/07/2026',
  channelId: 'channel-1',
  templateKey: 'aviso-importante',
  sentBy: 'reviewer@example.test',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRuntimeConfig.renewal.discordMessagesEnabled = true
  mockAxiosPost.mockResolvedValue({ data: { messageIds: ['message-1'], parts: 1 } })
  mockMessageLogCreate.mockResolvedValue(undefined)
})

describe('Discord message provider write-path characterization', () => {
  test('lost lease after provider await blocks provider success and Mongo audit', async () => {
    let checks = 0
    const context = {
      lease: {
        assertOwnership: jest.fn(() => {
          checks += 1
          if (checks === 2) throw new ActiveCampaignExecutionOwnershipError('discord-message')
        }),
      },
      provider: {
        begin: jest.fn(), notAttempted: jest.fn(), success: jest.fn(), retryableFailure: jest.fn(),
      },
    } as unknown as DiscordMessageExecutionContext
    await expect(performDiscordMessage({
      channelId: 'channel-1', content: 'Renova', mentionRoleIds: [], mentionRoleNames: [],
      mentionEveryone: false, sentBy: 'reviewer@example.test', url: 'http://discord-bot', headers: {},
    }, context)).rejects.toThrow(ActiveCampaignExecutionOwnershipError)
    expect(context.provider.success).not.toHaveBeenCalled()
    expect(mockMessageLogCreate).not.toHaveBeenCalled()
  })

  test('provider success is followed by one Mongo audit log', async () => {
    const result = await sendDiscordMessage(message)

    expect(result).toEqual({
      success: true,
      message: 'Publicada (1 parte(s))',
      messageIds: ['message-1'],
    })
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://discord-bot/renewal/messages/send',
      expect.objectContaining({
        channelId: 'channel-1',
        content: expect.stringContaining('31/07/2026'),
        mentionRoleIds: ['1525119563182772385'],
      }),
      expect.objectContaining({ headers: { 'Content-Type': 'application/json', 'X-Bot-Auth': 'secret' } }),
    )
    expect(mockMessageLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      channelId: 'channel-1',
      templateKey: 'aviso-importante',
      sentBy: 'reviewer@example.test',
      messageIds: ['message-1'],
    }))
  })

  test('provider failure leaves no success audit and remains retryable', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('provider unavailable'))

    const failed = await sendDiscordMessage(message)
    const retried = await sendDiscordMessage(message)

    expect(failed.success).toBe(false)
    expect(retried.success).toBe(true)
    expect(mockAxiosPost).toHaveBeenCalledTimes(2)
    expect(mockMessageLogCreate).toHaveBeenCalledTimes(1)
  })

  test('same request replay publishes twice because no idempotency key crosses the provider boundary', async () => {
    await sendDiscordMessage(message)
    await sendDiscordMessage(message)

    expect(mockAxiosPost).toHaveBeenCalledTimes(2)
    expect(mockMessageLogCreate).toHaveBeenCalledTimes(2)
  })

  test('message kill switch blocks provider and audit writes', async () => {
    mockRuntimeConfig.renewal.discordMessagesEnabled = false

    const result = await sendDiscordMessage(message)

    expect(result).toEqual({
      success: false,
      message: 'DISCORD_MESSAGES_ENABLED != true — envio recusado (nada publicado)',
    })
    expect(mockAxiosPost).not.toHaveBeenCalled()
    expect(mockMessageLogCreate).not.toHaveBeenCalled()
  })
})
