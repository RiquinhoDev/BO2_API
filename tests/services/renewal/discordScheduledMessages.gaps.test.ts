const mockRuleUpdateOne = jest.fn()
const mockRuleFind = jest.fn()
const mockRuleFindOne = jest.fn()
const mockTemplateFindOne = jest.fn()
const mockRoleStateCountDocuments = jest.fn()
const mockSendDiscordMessage = jest.fn()
const mockRuntimeConfig = {
  renewal: { discordScheduledMessagesEnabled: true },
}
const mockRenewalRoles = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [index + 1, {
    roleId: `role-${index + 1}`,
    roleName: `R.${index + 1}`,
  }]),
)

jest.mock('../../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => mockRuntimeConfig,
}))

jest.mock('../../../src/models/discordRenewal', () => ({
  DiscordScheduledRule: {
    updateOne: mockRuleUpdateOne,
    find: mockRuleFind,
    findOne: mockRuleFindOne,
  },
  DiscordMessageTemplate: { findOne: mockTemplateFindOne },
  DiscordRoleState: { countDocuments: mockRoleStateCountDocuments },
}))

jest.mock('../../../src/services/renewal/discordRolesSync.service', () => ({
  RENEWAL_ROLES: mockRenewalRoles,
  renderMessage: jest.fn((content: string) => content),
  sendDiscordMessage: mockSendDiscordMessage,
}))

import {
  getTargetMonth,
  previewScheduledRule,
  runScheduledMessagesJob,
  testScheduledRule,
} from '../../../src/services/renewal/discordScheduledMessages.service'

type FakeRule = {
  key: string
  dayOfMonth: number
  templateKey: string
  channelId: string
  enabled: boolean
  lastSentMonth?: string
  lastRunAt?: Date
  lastResult?: string
  save: jest.Mock<Promise<void>, []>
}

function rule(): FakeRule {
  return {
    key: 'lembrete-dia-8',
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    channelId: 'channel-1',
    enabled: true,
    save: jest.fn().mockResolvedValue(undefined),
  }
}

function query<T>(value: T) {
  const result = { exec: jest.fn().mockResolvedValue(value) }
  return { ...result, limit: jest.fn(() => result) }
}

function leanQuery<T>(value: T) {
  return { lean: jest.fn().mockReturnValue(query(value)) }
}

function setupJob(currentRule: FakeRule) {
  mockRuleUpdateOne.mockResolvedValue({ acknowledged: true })
  mockRuleFind.mockReturnValue(query([currentRule]))
  mockRoleStateCountDocuments.mockResolvedValue(1)
  mockTemplateFindOne.mockReturnValue(leanQuery({ content: 'Renova até {dataFim}' }))
  mockSendDiscordMessage.mockImplementation(async (
    _params: unknown,
    _requestId: string,
    options?: {
      beforeProviderAttempt?: () => void
      afterProviderSuccess?: (context: unknown) => Promise<void>
    },
  ) => {
    options?.beforeProviderAttempt?.()
    await options?.afterProviderSuccess?.({ lease: { assertOwnership: jest.fn() } })
    return { success: true, message: 'sent', messageIds: ['m-1'] }
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-08-08T09:00:00.000Z'))
  jest.clearAllMocks()
  mockRuntimeConfig.renewal.discordScheduledMessagesEnabled = true
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Discord scheduled message write-path characterization', () => {
  test('scheduled success persists the month after provider success and sequential replay skips', async () => {
    const currentRule = rule()
    setupJob(currentRule)

    const first = await runScheduledMessagesJob()

    expect(first.sent).toBe(1)
    expect(mockSendDiscordMessage).toHaveBeenCalledTimes(1)
    expect(currentRule.lastSentMonth).toBe('2026-08')
    expect(currentRule.save).toHaveBeenCalledTimes(1)

    mockSendDiscordMessage.mockClear()
    const replay = await runScheduledMessagesJob()

    expect(replay.sent).toBe(0)
    expect(mockSendDiscordMessage).not.toHaveBeenCalled()
    expect(replay.skipped).toEqual([
      { rule: currentRule.key, reason: 'já enviada este mês (2026-08)' },
    ])
  })

  test('manual execution receives phase transitions from the concrete Discord runner', async () => {
    const currentRule = rule()
    setupJob(currentRule)
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    const report = await runScheduledMessagesJob(undefined, { phaseHooks })

    expect(report.sent).toBe(1)
    expect(phaseHooks.providerStarted).toHaveBeenCalledTimes(1)
    expect(phaseHooks.providerSucceeded).toHaveBeenCalledTimes(1)
    expect(phaseHooks.localMutationStarted).toHaveBeenCalledTimes(2)
  })

  test('concurrent core runs pass the same rule-month receipt identity to the sender', async () => {
    const currentRule = rule()
    setupJob(currentRule)
    let started = 0
    let release!: () => void
    const providerGate = new Promise<void>((resolve) => { release = resolve })
    mockSendDiscordMessage.mockImplementation(async () => {
      started += 1
      await providerGate
      return { success: true, message: 'sent' }
    })

    const first = runScheduledMessagesJob()
    while (started < 1) await Promise.resolve()
    const second = runScheduledMessagesJob()
    while (started < 2) await Promise.resolve()

    expect(mockSendDiscordMessage).toHaveBeenCalledTimes(2)
    const firstCall = mockSendDiscordMessage.mock.calls[0]
    const secondCall = mockSendDiscordMessage.mock.calls[1]
    expect(firstCall[1]).toBe('cron:DiscordScheduledMessages:lembrete-dia-8:2026-08')
    expect(secondCall[1]).toBe(firstCall[1])
    expect(firstCall[2]).toEqual(expect.objectContaining({
      operation: 'scheduled-rule',
      identity: 'rule:lembrete-dia-8:2026-08',
    }))
    expect(secondCall[2]).toEqual(expect.objectContaining({
      operation: 'scheduled-rule',
      identity: 'rule:lembrete-dia-8:2026-08',
    }))

    release()
    await Promise.all([first, second])
  })

  test('provider failure is persisted as a retryable partial run', async () => {
    const currentRule = rule()
    setupJob(currentRule)
    mockSendDiscordMessage.mockImplementationOnce(async () => ({
      success: false,
      message: 'provider unavailable',
    }))

    const failed = await runScheduledMessagesJob()

    expect(failed.sent).toBe(0)
    expect(currentRule.lastSentMonth).toBeUndefined()
    expect(currentRule.lastResult).toBe('FALHOU: provider unavailable')
    expect(currentRule.save).toHaveBeenCalledTimes(1)

    mockSendDiscordMessage.mockImplementationOnce(async (
      _params: unknown,
      _requestId: string,
      options?: { afterProviderSuccess?: (context: unknown) => Promise<void> },
    ) => {
      await options?.afterProviderSuccess?.({ lease: { assertOwnership: jest.fn() } })
      return { success: true, message: 'sent' }
    })
    const retried = await runScheduledMessagesJob()

    expect(retried.sent).toBe(1)
    expect(currentRule.lastSentMonth).toBe('2026-08')
    expect(mockSendDiscordMessage).toHaveBeenCalledTimes(2)
  })

  test('test path invokes provider without mentions while preview remains provider-free', async () => {
    const currentRule = rule()
    mockRuleFindOne.mockReturnValue(leanQuery(currentRule))
    mockTemplateFindOne.mockReturnValue(leanQuery({ content: 'Renova até {dataFim}' }))
    mockSendDiscordMessage.mockResolvedValue({ success: true, message: 'sent' })

    const testResult = await testScheduledRule(currentRule.key, 'reviewer@example.test')
    expect(testResult.success).toBe(true)
    expect(mockSendDiscordMessage).toHaveBeenCalledWith(expect.objectContaining({
      mentionRoleIds: [],
      sentBy: 'reviewer@example.test',
    }))

    mockSendDiscordMessage.mockClear()
    const preview = await previewScheduledRule(currentRule.key)
    expect(preview.success).toBe(true)
    expect(preview.preview).toContain('Renova até')
    expect(mockSendDiscordMessage).not.toHaveBeenCalled()
  })

  test('scheduled master switch blocks provider path before send', async () => {
    const currentRule = rule()
    setupJob(currentRule)
    mockRuntimeConfig.renewal.discordScheduledMessagesEnabled = false

    const report = await runScheduledMessagesJob()

    expect(report.sent).toBe(0)
    expect(mockSendDiscordMessage).not.toHaveBeenCalled()
    expect(currentRule.lastResult).toContain('DISCORD_SCHEDULED_MESSAGES_ENABLED')
  })

  test('target month and idempotency key are derived from current Lisbon month', () => {
    expect(getTargetMonth(new Date('2026-08-08T09:00:00.000Z'))).toEqual({
      month: 7,
      year: 2026,
      roleId: 'role-7',
      roleName: 'R.7',
      dataFim: '31/07/2026',
      monthKey: '2026-08',
    })
  })
})
