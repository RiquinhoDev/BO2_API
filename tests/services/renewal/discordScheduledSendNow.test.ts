const mockRule = jest.fn()
const mockTemplate = jest.fn()
const mockCount = jest.fn()
const mockSend = jest.fn()
const mockEnabled = jest.fn()
jest.mock('../../../src/models/discordRenewal', () => ({
  DiscordScheduledRule: { findOne: mockRule },
  DiscordMessageTemplate: { findOne: mockTemplate },
  DiscordRoleState: { countDocuments: mockCount },
}))
jest.mock('../../../src/services/renewal/discordRolesSync.service', () => ({ sendDiscordMessage: mockSend }))
jest.mock('../../../src/services/renewal/discordScheduledMessages.service', () => ({
  isScheduledMessagesEnabled: mockEnabled,
  getTargetMonth: () => ({ monthKey: '2026-08', roleId: 'role-7', roleName: 'R.7', dataFim: '31/07/2026' }),
}))
import { sendScheduledRuleNow } from '../../../src/services/renewal/discordScheduledSendNow.service'

const currentRule = { key: 'lembrete-dia-8', templateKey: 'aviso', enabled: true, dayOfMonth: 8, lastSentMonth: '', save: jest.fn() }
beforeEach(() => {
  jest.resetAllMocks()
  currentRule.enabled = true
  currentRule.lastSentMonth = ''
  currentRule.save.mockResolvedValue(undefined)
  mockEnabled.mockReturnValue(true)
  mockRule.mockReturnValue({ exec: async () => currentRule })
  mockTemplate.mockReturnValue({ lean: () => ({ exec: async () => ({ content: 'Renova' }) }) })
  mockCount.mockResolvedValue(2)
  mockSend.mockResolvedValue({ success: true, message: 'sent' })
})

test('manual send ignores calendar day and shares cron monthly receipt, persisting only after provider success', async () => {
  await sendScheduledRuleNow('lembrete-dia-8', 'actor@example.test')
  const [params, requestId, options] = mockSend.mock.calls[0]
  expect(params).toMatchObject({ mentionRoleIds: ['role-7'], sentBy: 'actor@example.test' })
  expect(requestId).toBe('cron:DiscordScheduledMessages:lembrete-dia-8:2026-08')
  expect(options).toMatchObject({ operation: 'scheduled-rule', identity: 'rule:lembrete-dia-8:2026-08' })
  expect(currentRule.save).not.toHaveBeenCalled()
  const assertOwnership = jest.fn()
  await options.afterProviderSuccess({ lease: { assertOwnership } })
  expect(assertOwnership).toHaveBeenCalled()
  expect(currentRule.lastSentMonth).toBe('2026-08')
  expect(currentRule.save).toHaveBeenCalledTimes(1)
})

test('disabled switch stops before database and provider work', async () => {
  mockEnabled.mockReturnValue(false)
  expect(await sendScheduledRuleNow('lembrete-dia-8', 'actor')).toMatchObject({ success: false })
  expect(mockRule).not.toHaveBeenCalled()
  expect(mockSend).not.toHaveBeenCalled()
})

test.each(['disabled', 'sent', 'empty', 'template'] as const)('guard %s prevents notification', async (guard) => {
  if (guard === 'disabled') currentRule.enabled = false
  if (guard === 'sent') currentRule.lastSentMonth = '2026-08'
  if (guard === 'empty') mockCount.mockResolvedValue(0)
  if (guard === 'template') mockTemplate.mockReturnValue({ lean: () => ({ exec: async () => null }) })
  expect(await sendScheduledRuleNow('lembrete-dia-8', 'actor')).toMatchObject({ success: false })
  expect(mockSend).not.toHaveBeenCalled()
  expect(currentRule.save).not.toHaveBeenCalled()
})

test('dry run previews without provider or local writes', async () => {
  expect(await sendScheduledRuleNow('lembrete-dia-8', 'actor', { dryRun: true })).toMatchObject({ success: true, dryRun: true })
  expect(mockSend).not.toHaveBeenCalled()
  expect(currentRule.save).not.toHaveBeenCalled()
})

test('lost ownership after provider success refuses month projection', async () => {
  await sendScheduledRuleNow('lembrete-dia-8', 'actor')
  await expect(mockSend.mock.calls[0][2].afterProviderSuccess({ lease: { assertOwnership: () => { throw new Error('lease lost') } } }))
    .rejects.toThrow('lease lost')
  expect(currentRule.save).not.toHaveBeenCalled()
})
