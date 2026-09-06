const mockAxiosGet = jest.fn()
const mockProductFindOne = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserProductUpdateOne = jest.fn()
const mockGetHotmartAccessToken = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
}))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: mockProductFindOne },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind, findOne: mockUserFindOne },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind, updateOne: mockUserProductUpdateOne },
}))
jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers', () => ({
  getHotmartAccessToken: mockGetHotmartAccessToken,
}))
jest.mock('../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({ renewal: { hotmartOgiProductId: 'hotmart-product' } }),
}))

import { MAX_PROVIDER_READ_ITEMS } from '../../src/security/providerReadBatchPolicy'
import {
  applyHotmartRefunds,
  detectHotmartRefunds,
  prepareHotmartRefunds,
} from '../../src/services/renewal/hotmartRefunds.service'

function query<T>(result: T) {
  const chain = {
    sort: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  }
  chain.sort.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.lean.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetHotmartAccessToken.mockResolvedValue('token')
  mockProductFindOne.mockReturnValue(query({ _id: 'ogi-id', hotmartProductId: 'hotmart-product' }))
  mockUserFindOne.mockReturnValue(query({ _id: 'user-id' }))
  mockUserFind.mockReturnValue(query([]))
  mockUserProductFind.mockReturnValue(query([]))
  mockUserProductUpdateOne.mockResolvedValue({ modifiedCount: 1 })
})

test('refund provider scan rejects the cap sentinel before local writes', async () => {
  mockAxiosGet.mockResolvedValue({
    data: { items: Array.from({ length: MAX_PROVIDER_READ_ITEMS + 1 }, () => ({})) },
  })

  await expect(detectHotmartRefunds()).rejects.toMatchObject({
    status: 413,
    code: 'RENEWAL_AC_REFUND_SCAN_CAP_EXCEEDED',
  })
  expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
})

test('refund local writes run behind the execution phase hook', async () => {
  mockAxiosGet.mockResolvedValue({
    data: {
      items: [{
        purchase: {
          product: { id: 'hotmart-product' },
          buyer: { email: 'buyer@example.test' },
          transaction: 'transaction-1',
          approved_date: 1_700_000_000_000,
        },
      }],
    },
  })
  mockUserFind.mockReturnValue(query([{ _id: 'user-id', email: 'buyer@example.test' }]))
  mockUserProductFind.mockReturnValue(query([{
    _id: 'up-id',
    userId: 'user-id',
    metadata: { refunded: false },
    platformData: { renewalAc: { appliedTurmaTag: 'OGI - Turma 10' } },
  }]))
  const phaseHooks = {
    localMutationStarted: jest.fn(),
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
  }

  await detectHotmartRefunds(30, { phaseHooks })

  expect(phaseHooks.localMutationStarted).toHaveBeenCalledTimes(1)
  expect(phaseHooks.assertOwnership).toHaveBeenCalledTimes(1)
  expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(1)
})

test('refund preparation exposes newly detected UserProducts before apply', async () => {
  mockAxiosGet.mockResolvedValue({
    data: {
      items: [{
        purchase: {
          product: { id: 'hotmart-product' },
          buyer: { email: 'buyer@example.test' },
          transaction: 'transaction-1',
          approved_date: 1_700_000_000_000,
        },
      }],
    },
  })
  mockUserFind.mockReturnValue(query([{ _id: 'user-id', email: 'buyer@example.test' }]))
  mockUserProductFind.mockReturnValue(query([{
    _id: 'up-id',
    userId: 'user-id',
    metadata: { refunded: false },
    platformData: { renewalAc: { appliedTurmaTag: 'OGI - Turma 10' } },
  }]))

  const prepared = await prepareHotmartRefunds()

  expect(prepared.refundedUps).toEqual([expect.objectContaining({
    userId: 'user-id',
    platformData: { renewalAc: { appliedTurmaTag: 'OGI - Turma 10' } },
    metadata: expect.objectContaining({ refunded: true }),
  })])
  expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
  await applyHotmartRefunds(prepared)
  expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(1)
})

test('refund preparation marks eligible UserProducts even without a prior AC tag', async () => {
  mockAxiosGet.mockResolvedValue({
    data: {
      items: [{
        purchase: {
          product: { id: 'hotmart-product' },
          buyer: { email: 'buyer@example.test' },
          transaction: 'transaction-no-tag',
          approved_date: 1_700_000_000_000,
        },
      }],
    },
  })
  mockUserFind.mockReturnValue(query([{ _id: 'user-id', email: 'buyer@example.test' }]))
  const userProduct = {
    _id: 'up-no-tag',
    userId: 'user-id',
    metadata: { refunded: false },
    platformData: { renewalAc: {} },
  }
  mockUserProductFind.mockImplementation((filter: Record<string, unknown>) =>
    filter['platformData.renewalAc.appliedTurmaTag'] ? query([]) : query([userProduct]))

  const prepared = await prepareHotmartRefunds()

  expect(prepared.refundedUps).toHaveLength(1)
  expect(prepared.report.newlyMarked).toBe(1)
  await applyHotmartRefunds(prepared)
  expect(mockUserProductUpdateOne).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'user-id' }),
    expect.objectContaining({ $set: expect.objectContaining({ 'metadata.refunded': true }) }),
  )
})
