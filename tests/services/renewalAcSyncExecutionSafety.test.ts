const mockChange = {
  find: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}
const mockProductFindOne = jest.fn()
const mockUpdateContactField = jest.fn()
const mockGetContactFieldValue = jest.fn()
const mockCronFindOne = jest.fn()
const mockRunWithReceipt = jest.fn()

jest.mock('../../src/models/RenewalAcChange', () => ({ __esModule: true, default: mockChange }))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: mockProductFindOne },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), updateOne: jest.fn() },
}))
jest.mock('../../src/models/StudentClassHistory', () => ({ __esModule: true, default: {} }))
jest.mock('../../src/models/user', () => ({ __esModule: true, default: {} }))
jest.mock('../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: { findOne: mockCronFindOne },
}))
jest.mock('../../src/services/cron/compositeExecution.service', () => ({
  compositeExecutionFingerprint: jest.fn(() => 'renewal-fingerprint'),
  runCompositeExecutionWithReceipt: mockRunWithReceipt,
}))
jest.mock('../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    renewal: {
      acSyncEnabled: true,
      manualExecutionEnabled: true,
      writeDatesEnabled: true,
      writeTagsEnabled: false,
      processRefundsEnabled: false,
      autoExecute: false,
      expiryFieldId: 332,
      maxChangesPerRun: 50,
    },
  }),
}))
jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    getContactFieldValue: mockGetContactFieldValue,
    updateContactField: mockUpdateContactField,
  },
}))

import { executeManualPlan, executePlan } from '../../src/services/renewal/activeCampaign/execution'

function query<T>(result: T) {
  const chain = {
    sort: jest.fn(),
    select: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  }
  chain.sort.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.lean.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  mockChange.updateMany.mockResolvedValue({ modifiedCount: 0 })
  mockChange.updateOne.mockResolvedValue({ modifiedCount: 1 })
  mockProductFindOne.mockReturnValue(query({ _id: 'ogi-id' }))
  mockChange.find.mockReturnValue(query([{
    _id: 'change-id',
    email: 'student@example.test',
    action: 'UPDATE_EXPIRY',
    status: 'APPROVED',
    payload: { fieldId: 332, after: '2026-10-01' },
  }]))
  mockGetContactFieldValue.mockResolvedValue({ contactId: 'contact', value: '2026-09-01' })
  mockUpdateContactField.mockResolvedValue(true)
  mockCronFindOne.mockResolvedValue({
    _id: { toString: () => 'cron-job-id' },
    name: 'RenewalAcSync',
    syncType: 'hotmart',
    __v: 3,
  })
  mockRunWithReceipt.mockImplementation(async (options: { run: (hooks: unknown) => Promise<unknown> }) =>
    options.run({
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }))
})

test('live Renewal AC execution marks provider and local phases around each mutation', async () => {
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }

  await expect(executePlan({
    executedBy: 'manual@example.test',
    phaseHooks,
  })).resolves.toMatchObject({ applied: 1, failed: 0 })

  expect(phaseHooks.providerStarted).toHaveBeenCalledTimes(1)
  expect(phaseHooks.providerSucceeded).toHaveBeenCalledTimes(1)
  expect(phaseHooks.localMutationStarted).toHaveBeenCalled()
  expect(mockUpdateContactField).toHaveBeenCalledWith(
    'student@example.test',
    332,
    '2026-10-01',
  )
})

test('strict manual execution rejects an over-cap candidate sentinel before expiry or provider writes', async () => {
  const overCap = Array.from({ length: 51 }, (_, index) => ({
    _id: `change-${index}`,
    email: 'student@example.test',
    action: 'UPDATE_EXPIRY',
    status: 'APPROVED',
    payload: { fieldId: 332, after: '2026-10-01' },
  }))
  mockChange.find.mockReturnValue(query(overCap))

  await expect(executePlan({
    executedBy: 'manual@example.test',
    strictCap: true,
  })).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_EXECUTION_CAP_EXCEEDED',
  })
  expect(mockChange.updateMany).not.toHaveBeenCalled()
  expect(mockChange.updateOne).not.toHaveBeenCalled()
  expect(mockUpdateContactField).not.toHaveBeenCalled()
})

test('Renewal AC direct execution uses the canonical cron identity and shared receipt', async () => {
  await executeManualPlan({
    executedBy: 'reviewer@example.test',
    actorId: 'reviewer@example.test',
    requestId: 'renewal-request',
    includePlanned: true,
    batchId: 'batch-safe',
  })

  expect(mockRunWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'cron-job',
    identity: 'cron-job:cron-job-id',
    actorId: 'reviewer@example.test',
    requestId: 'renewal-request',
    fingerprint: 'renewal-fingerprint',
  }))
})
