const mockFind = jest.fn()
const mockRun = jest.fn()
const mockReceipt = jest.fn()
const mockEnabled = jest.fn()
jest.mock('../../../src/models/SyncModels/CronJobConfig', () => ({ __esModule: true, default: { findOne: mockFind } }))
jest.mock('../../../src/services/renewal/renewalPipeline.service', () => ({ runRenewalPipeline: mockRun }))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({ isSyncMutableExecutionEnabled: mockEnabled }))
jest.mock('../../../src/services/cron/compositeExecution.service', () => ({ runCompositeExecutionWithReceipt: mockReceipt }))
import { runDailyRenewalFollowUp } from '../../../src/services/cron/dailyRenewalFollowUp'

const hooks = { assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn() }
beforeEach(() => {
  jest.resetAllMocks(); mockEnabled.mockReturnValue(true)
  const chain = { select: jest.fn(), maxTimeMS: jest.fn(), lean: jest.fn(), exec: async () => ({ isActive: true, schedule: { enabled: true } }) }
  for (const method of [chain.select, chain.maxTimeMS, chain.lean]) method.mockReturnValue(chain)
  mockFind.mockReturnValue(chain)
  mockReceipt.mockImplementation(options => options.run(hooks))
  mockRun.mockResolvedValue({ success: true })
})
test('failed parent never starts dependent renewal work', async () => {
  expect(await runDailyRenewalFollowUp(false, hooks)).toBeNull()
  expect(mockFind).not.toHaveBeenCalled(); expect(mockRun).not.toHaveBeenCalled()
})
test('default-off mutable switch prevents even job lookup', async () => {
  mockEnabled.mockReturnValue(false)
  expect(await runDailyRenewalFollowUp(true, hooks)).toBeNull()
  expect(mockFind).not.toHaveBeenCalled()
})
test('missing execution ownership refuses enabled work', async () => {
  await expect(runDailyRenewalFollowUp(true)).rejects.toThrow(/ownership/i)
  expect(mockReceipt).not.toHaveBeenCalled()
})
test('enabled successful parent awaits receipt-protected follow-up', async () => {
  expect(await runDailyRenewalFollowUp(true, hooks)).toEqual({ success: true })
  expect(mockReceipt).toHaveBeenCalledWith(expect.objectContaining({ identity: 'renewal-parity:renewal-pipeline' }))
  expect(mockRun).toHaveBeenCalledTimes(1)
})
test('reported failure cannot complete durable follow-up', async () => {
  mockRun.mockResolvedValue({ success: false })
  await expect(runDailyRenewalFollowUp(true, hooks)).rejects.toThrow(/failed/i)
})
test('lost parent ownership prevents receipt and dependent work', async () => {
  hooks.assertOwnership.mockImplementation(() => { throw new Error('parent lease lost') })
  await expect(runDailyRenewalFollowUp(true, hooks)).rejects.toThrow('parent lease lost')
  expect(mockReceipt).not.toHaveBeenCalled()
})
test('a no-op pipeline does not claim a provider attempt or success', async () => {
  await runDailyRenewalFollowUp(true, hooks)
  expect(hooks.providerStarted).not.toHaveBeenCalled()
  expect(hooks.providerSucceeded).not.toHaveBeenCalled()
})
