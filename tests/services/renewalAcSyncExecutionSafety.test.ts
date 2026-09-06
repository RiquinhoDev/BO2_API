const mockChange = {
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}
const mockProductFindOne = jest.fn()
const mockHistoryFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserProductFindOne = jest.fn()
const mockUserCountDocuments = jest.fn()
const mockUserFindOne = jest.fn()
const mockUpdateContactField = jest.fn()
const mockGetContactFieldValue = jest.fn()
const mockGetContactByEmail = jest.fn()
const mockGetContactTagsByEmail = jest.fn()
const mockGetContactTagsByEmailStrict = jest.fn()
const mockAddTag = jest.fn()
const mockRemoveTag = jest.fn()
const mockRemoveTagStrict = jest.fn()
const mockCronFindOne = jest.fn()
const mockRunWithReceipt = jest.fn()
const mockPrepareHotmartRefunds = jest.fn()
const mockApplyHotmartRefunds = jest.fn()
let writeTagsEnabled = false
let processRefundsEnabled = false
let autoExecuteEnabled = false

jest.mock('../../src/models/RenewalAcChange', () => ({ __esModule: true, default: mockChange }))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: mockProductFindOne },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind, findOne: mockUserProductFindOne, updateOne: jest.fn() },
}))
jest.mock('../../src/models/StudentClassHistory', () => ({ __esModule: true, default: { find: mockHistoryFind } }))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { countDocuments: mockUserCountDocuments, findOne: mockUserFindOne },
}))
jest.mock('../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: { findOne: mockCronFindOne },
}))
jest.mock('../../src/services/cron/compositeExecution.service', () => ({
  compositeExecutionFingerprint: jest.fn(() => 'renewal-fingerprint'),
  runCompositeExecutionWithReceipt: mockRunWithReceipt,
}))
jest.mock('../../src/services/renewal/hotmartRefunds.service', () => ({
  __esModule: true,
  prepareHotmartRefunds: mockPrepareHotmartRefunds,
  applyHotmartRefunds: mockApplyHotmartRefunds,
}))
jest.mock('../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    renewal: {
      acSyncEnabled: true,
      manualExecutionEnabled: true,
      writeDatesEnabled: true,
      writeTagsEnabled,
      processRefundsEnabled,
      autoExecute: autoExecuteEnabled,
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
    getContactByEmail: mockGetContactByEmail,
    getContactTagsByEmail: mockGetContactTagsByEmail,
    getContactTagsByEmailStrict: mockGetContactTagsByEmailStrict,
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
    removeTagStrict: mockRemoveTagStrict,
  },
}))

import {
  executeManualPlan,
  executePlan,
  getRenewalAcManualExecution,
  runRenewalAcSyncJob,
} from '../../src/services/renewal/activeCampaign/execution'
import { MAX_PROVIDER_READ_ITEMS } from '../../src/security/providerReadBatchPolicy'

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
  mockChange.create.mockResolvedValue({})
  mockChange.findOne.mockReturnValue(query(null))
  mockPrepareHotmartRefunds.mockReset()
  mockApplyHotmartRefunds.mockReset()
  writeTagsEnabled = false
  processRefundsEnabled = false
  autoExecuteEnabled = false
  mockProductFindOne.mockReturnValue(query({ _id: 'ogi-id' }))
  mockHistoryFind.mockReturnValue(query([]))
  mockUserProductFind.mockReturnValue(query([]))
  mockUserProductFindOne.mockReturnValue(query(null))
  mockUserCountDocuments.mockResolvedValue(0)
  mockUserFindOne.mockReturnValue(query(null))
  mockChange.find.mockReturnValue(query([{
    _id: 'change-id',
    email: 'student@example.test',
    action: 'UPDATE_EXPIRY',
    status: 'APPROVED',
    payload: { fieldId: 332, after: '2026-10-01' },
  }]))
  mockGetContactFieldValue.mockResolvedValue({ contactId: 'contact', value: '2026-09-01' })
  mockUpdateContactField.mockResolvedValue(true)
  mockGetContactByEmail.mockResolvedValue({ contact: { id: 'contact' } })
  mockGetContactTagsByEmail.mockResolvedValue([])
  mockGetContactTagsByEmailStrict.mockResolvedValue({ contactFound: true, tags: [] })
  mockAddTag.mockResolvedValue({})
  mockRemoveTag.mockResolvedValue(true)
  mockRemoveTagStrict.mockResolvedValue(true)
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

test('Renewal AC manual status uses the canonical generic capability view', () => {
  expect(getRenewalAcManualExecution()).toEqual({
    capability: 'renewal-ac-sync',
    status: 'implemented',
    cap: {
      status: 'verified',
      reason: 'renewal-ac-sync-max-planning-and-refund-inputs',
      limit: MAX_PROVIDER_READ_ITEMS,
    },
    dryRunSupported: true,
    mutableEnabled: true,
  })
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

test('strict direct execution scopes preflight to effective status and batch filters', async () => {
  const selected = {
    _id: 'selected-change',
    email: 'student@example.test',
    action: 'UPDATE_EXPIRY',
    status: 'APPROVED',
    planBatchId: 'batch-safe',
    payload: { fieldId: 332, after: '2026-10-01' },
  }
  const unrelated = Array.from({ length: 50 }, (_, index) => ({
    ...selected,
    _id: `unrelated-${index}`,
    status: 'PLANNED',
    planBatchId: 'other-batch',
  }))
  mockChange.find.mockImplementation((filter: { planBatchId?: string }) =>
    query(filter.planBatchId ? [selected] : [...unrelated, selected]))

  await expect(executePlan({
    includePlanned: false,
    batchId: 'batch-safe',
    executedBy: 'manual@example.test',
    strictCap: true,
  })).resolves.toMatchObject({ attempted: 1 })
})

test('strict Renewal AC job preflights existing and projected candidates before any mutation', async () => {
  autoExecuteEnabled = true
  const overCap = Array.from({ length: 50 }, (_, index) => ({
    _id: `change-${index}`,
    email: 'student@example.test',
    action: 'UPDATE_EXPIRY',
    status: 'APPROVED',
    payload: { fieldId: 332, after: '2026-10-01' },
  }))
  mockChange.find.mockReturnValue(query(overCap))
  mockHistoryFind.mockReturnValue(query([{
    _id: 'history-projected',
    studentId: 'student-id',
    className: 'Turma 10 | 2505',
    previousClassName: 'Turma 9 | 2504',
    dateMoved: new Date(),
  }]))
  mockUserFindOne.mockReturnValue(query({ email: 'student@example.test' }))
  mockUserProductFindOne.mockReturnValue(query({ metadata: { purchaseDate: new Date() } }))
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }

  await expect(runRenewalAcSyncJob({ strictCap: true, phaseHooks })).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_EXECUTION_CAP_EXCEEDED',
  })
  expect(mockChange.create).not.toHaveBeenCalled()
  expect(mockChange.updateMany).not.toHaveBeenCalled()
  expect(mockChange.updateOne).not.toHaveBeenCalled()
  expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
})

test('prepared refunds participate in the same Renewal AC plan before persistence', async () => {
  processRefundsEnabled = true
  mockPrepareHotmartRefunds.mockResolvedValue({
    report: {
      windowDays: 30,
      salesChecked: 1,
      refundsFound: 1,
      newlyMarked: 1,
      alreadyMarked: 0,
      usersNotFound: 0,
      refunds: [],
    },
    ogiObjectId: 'ogi-id',
    refundedUps: [{
      userId: 'user-id',
      metadata: { refunded: true, refundedAt: new Date() },
      platformData: { renewalAc: { appliedTurmaTag: 'Aluno OGI1234 - Turma 10' } },
    }],
    pendingMarks: [{ userId: 'user-id', refundDate: new Date() }],
  })
  mockApplyHotmartRefunds.mockImplementation(async (prepared: { report: unknown }) => prepared.report)
  mockUserFindOne.mockReturnValue(query({ email: 'student@example.test' }))

  const report = await runRenewalAcSyncJob()

  expect(mockPrepareHotmartRefunds).toHaveBeenCalledTimes(1)
  expect(mockApplyHotmartRefunds).toHaveBeenCalledTimes(1)
  expect(report.refundDetection).not.toBeNull()
  expect(mockChange.create).toHaveBeenCalledWith(expect.objectContaining({
    source: 'REFUND',
    action: 'REMOVE_TAG',
  }))
})

test('scheduled Renewal AC rejects an over-cap merged refund input before local writes', async () => {
  processRefundsEnabled = true
  mockPrepareHotmartRefunds.mockResolvedValue({
    report: { windowDays: 30, salesChecked: 1, refundsFound: MAX_PROVIDER_READ_ITEMS + 1, newlyMarked: 0, alreadyMarked: 0, usersNotFound: 0, refunds: [] },
    ogiObjectId: 'ogi-id',
    refundedUps: Array.from({ length: MAX_PROVIDER_READ_ITEMS + 1 }, (_, index) => ({
      userId: `refund-user-${index}`,
      metadata: { refunded: true, refundedAt: new Date(1_700_000_000_000 + index) },
      platformData: { renewalAc: {} },
    })),
    pendingMarks: [],
  })

  await expect(runRenewalAcSyncJob()).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_PLAN_CAP_EXCEEDED',
  })
  expect(mockApplyHotmartRefunds).not.toHaveBeenCalled()
  expect(mockChange.updateMany).not.toHaveBeenCalled()
  expect(mockChange.create).not.toHaveBeenCalled()
})

test('APPLY_TAG fences both local bookkeeping writes', async () => {
  writeTagsEnabled = true
  mockChange.find.mockReturnValue(query([{
    _id: 'change-tag',
    userId: 'user-id',
    email: 'student@example.test',
    action: 'APPLY_TAG',
    status: 'APPROVED',
    payload: { tagName: 'Aluno OGI1234 - Turma 10' },
  }]))
  mockUserProductFindOne.mockReturnValue(query({ metadata: {} }))
  mockGetContactTagsByEmail.mockResolvedValue(['Aluno OGI1234 - Turma 10'])
  mockGetContactTagsByEmailStrict.mockResolvedValue({ contactFound: true, tags: ['Aluno OGI1234 - Turma 10'] })
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }

  await expect(executePlan({ executedBy: 'manual@example.test', phaseHooks })).resolves.toMatchObject({ alreadyInSync: 1 })
  expect(phaseHooks.localMutationStarted).toHaveBeenCalledTimes(3)
})

test('tag reads fail closed when the strict ActiveCampaign read is unavailable', async () => {
  writeTagsEnabled = true
  mockChange.find.mockReturnValue(query([{
    _id: 'change-read',
    email: 'student@example.test',
    action: 'REMOVE_TAG',
    status: 'APPROVED',
    payload: { tagName: 'Aluno OGI1234 - Turma 10' },
  }]))
  mockGetContactTagsByEmail.mockResolvedValue([])
  mockGetContactTagsByEmailStrict.mockRejectedValue(new Error('provider read unavailable'))

  await expect(executePlan({
    executedBy: 'manual@example.test',
    phaseHooks: {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    },
  })).rejects.toThrow('provider read unavailable')
  expect(mockChange.updateOne).not.toHaveBeenCalled()
  expect(mockRemoveTag).not.toHaveBeenCalled()
})

test('tag removal uses the strict mutation path and propagates unknown verification', async () => {
  writeTagsEnabled = true
  mockChange.find.mockReturnValue(query([{
    _id: 'change-remove',
    email: 'student@example.test',
    action: 'REMOVE_TAG',
    status: 'APPROVED',
    payload: { tagName: 'Aluno OGI1234 - Turma 10' },
  }]))
  mockGetContactTagsByEmail.mockResolvedValue(['Aluno OGI1234 - Turma 10'])
  mockGetContactTagsByEmailStrict.mockResolvedValue({ contactFound: true, tags: ['Aluno OGI1234 - Turma 10'] })
  mockRemoveTag.mockResolvedValue(true)
  mockRemoveTagStrict.mockRejectedValue(new Error('provider removal verification unavailable'))

  await expect(executePlan({
    executedBy: 'manual@example.test',
    phaseHooks: {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    },
  })).rejects.toThrow('provider removal verification unavailable')
  expect(mockChange.updateOne).not.toHaveBeenCalled()
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
