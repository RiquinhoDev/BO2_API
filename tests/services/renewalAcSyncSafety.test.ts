import { MAX_PROVIDER_READ_ITEMS } from '../../src/security/providerReadBatchPolicy'

const mockRenewalAcChange = {
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}
const mockHistoryFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserFind = jest.fn()
const mockProductFindOne = jest.fn()

jest.mock('../../src/models/RenewalAcChange', () => ({
  __esModule: true,
  default: mockRenewalAcChange,
}))
jest.mock('../../src/models/StudentClassHistory', () => ({
  __esModule: true,
  default: { find: mockHistoryFind },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind, findOne: jest.fn() },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(), findOne: mockUserFind },
}))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: mockProductFindOne },
}))
jest.mock('../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    renewal: {
      acSyncEnabled: false,
      manualExecutionEnabled: false,
      writeDatesEnabled: false,
      writeTagsEnabled: false,
      processRefundsEnabled: false,
      autoExecute: false,
      expiryFieldId: 332,
      maxChangesPerRun: 50,
    },
  }),
}))

import {
  generatePlan,
  mergePreparedRefunds,
  type PlanInput,
} from '../../src/services/renewal/activeCampaign/planning'

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
  mockProductFindOne.mockReturnValue(query({ _id: 'product-id' }))
  mockHistoryFind.mockReturnValue(query([]))
  mockUserProductFind.mockReturnValue(query([]))
  mockUserFind.mockReturnValue(query(null))
  ;(require('../../src/models/user').default.countDocuments as jest.Mock).mockResolvedValue(0)
})

test('dry-run reads bounded deterministic inputs and performs no Renewal AC local writes', async () => {
  const report = await generatePlan(26, { dryRun: true })

  expect(mockHistoryFind.mock.results[0].value.sort).toHaveBeenCalledWith({ dateMoved: 1, _id: 1 })
  expect(mockHistoryFind.mock.results[0].value.limit).toHaveBeenCalledWith(MAX_PROVIDER_READ_ITEMS + 1)
  expect(mockUserProductFind.mock.results[0].value.sort).toHaveBeenCalledWith({ 'metadata.refundedAt': 1, _id: 1 })
  expect(mockUserProductFind.mock.results[0].value.limit).toHaveBeenCalledWith(MAX_PROVIDER_READ_ITEMS + 1)
  expect(mockRenewalAcChange.create).not.toHaveBeenCalled()
  expect(report).toMatchObject({
    operation: 'renewal-ac-sync',
    dryRun: true,
    truncated: false,
    remaining: 0,
    planned: 0,
  })
})

test('live planning rejects the history sentinel before any local mutation', async () => {
  const rows = Array.from({ length: MAX_PROVIDER_READ_ITEMS + 1 }, (_, index) => ({
    _id: `history-${index}`,
    studentId: `student-${index}`,
    className: 'Turma 10 | 2505',
    previousClassName: 'Turma 9 | 2504',
    dateMoved: new Date(),
  }))
  mockHistoryFind.mockReturnValue(query(rows))

  await expect(generatePlan(26)).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_PLAN_CAP_EXCEEDED',
  })
  expect(mockRenewalAcChange.create).not.toHaveBeenCalled()
})

test('mergePreparedRefunds deduplicates and re-caps combined bounded inputs', async () => {
  const refund = (index: number) => ({
    userId: `user-${index}` as never,
    metadata: { refunded: true, refundedAt: new Date(1_700_000_000_000 + index) },
    platformData: { renewalAc: { appliedTurmaTag: `Aluno OGI${index} - Turma 10` } },
  })
  const inputs: PlanInput = {
    ogiId: null,
    changes: [],
    refundedUps: Array.from({ length: MAX_PROVIDER_READ_ITEMS }, (_, index) => refund(index)),
    refundedUserIds: Array.from({ length: MAX_PROVIDER_READ_ITEMS }, (_, index) => `user-${index}`),
    truncated: false,
    remaining: 0,
  }
  const additional = Array.from({ length: MAX_PROVIDER_READ_ITEMS }, (_, index) => refund(index + MAX_PROVIDER_READ_ITEMS / 2))

  const merged = mergePreparedRefunds(inputs, additional)

  expect(merged.refundedUps).toHaveLength(MAX_PROVIDER_READ_ITEMS)
  expect(merged.truncated).toBe(true)
  expect(merged.remaining).toBeGreaterThanOrEqual(1)
  await expect(generatePlan(26, { preparedInputs: merged })).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_PLAN_CAP_EXCEEDED',
  })
  await expect(generatePlan(26, { dryRun: true, preparedInputs: merged })).resolves.toMatchObject({
    dryRun: true,
    truncated: true,
    remaining: expect.any(Number),
  })
  expect(mockRenewalAcChange.create).not.toHaveBeenCalled()
})
