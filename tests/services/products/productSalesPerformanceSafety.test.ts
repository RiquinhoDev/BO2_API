const mockSave = jest.fn()
const mockHistory = jest.fn()
const mockSubscriptions = jest.fn()
const mockGet = jest.fn()
const mockOwnership = jest.fn()
const mockFind = jest.fn()
const mockDistinct = jest.fn()
const mockSettings = jest.fn()
jest.mock('../../../src/models/ProductSalesMonthlyStats', () => ({ __esModule: true, default: { updateOne: mockSave, find: mockFind, distinct: mockDistinct } }))
jest.mock('../../../src/services/renewal/hotmartSalesHistory.service', () => ({
  fetchAllOgiSalesGroupedByEmail: mockHistory,
  resolveOgiProduct: async () => ({ hotmartProductId: 'synthetic' }),
  aggregateMonthlySalesStats: () => [{ month: '2026-08' }],
  emptyMonthlyStat: () => ({ month: '2026-08', salesCount: 0, revenueByCurrency: {}, newCount: 0, newRevenueByCurrency: {}, recurringCount: 0, recurringRevenueByCurrency: {}, refundedCount: 0, refundedByCurrency: {} }),
}))
jest.mock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers', () => ({ getHotmartAccessToken: async () => 'test-token' }))
jest.mock('../../../src/services/guru/guruSync.service', () => ({ fetchAllSubscriptionsPaginated: mockSubscriptions }))
jest.mock('../../../src/config/renewalEnvironment', () => ({ getRenewalParitySettings: mockSettings }))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({ getOptionalGuruUserToken: () => 'test-token' }))
jest.mock('../../../src/utils/currencyEstimate', () => ({ estimateEUR: () => ({ estimatedTotalEUR: 0, unconvertedCurrencies: [] }) }))
jest.mock('../../../src/services/renewal/mainParityExecution', () => ({
  assertMainParityOwnership: mockOwnership, mainParityProviderStarted: jest.fn(), mainParityProviderSucceeded: jest.fn(), mainParityLocalMutationStarted: jest.fn(),
}))
jest.mock('axios', () => ({ __esModule: true, default: {
  create: () => ({ get: mockGet, interceptors: { request: { use: jest.fn() } } }),
  isAxiosError: (error: unknown) => typeof error === 'object' && error !== null && 'response' in error,
} }))

import { syncOgiSalesPerformance, syncClarezaPlanSalesPerformance, syncAllProductSalesPerformance, getProductSalesPerformance } from '../../../src/services/products/productSalesPerformance.service'

beforeEach(() => {
  jest.resetAllMocks()
  mockSettings.mockReturnValue({ guruClarezaMonthlyProductId: 'monthly', guruClarezaAnnualProductId: 'annual' })
  mockSave.mockResolvedValue({})
  mockHistory.mockResolvedValue({ salesByEmail: new Map(), salesChecked: 0, paginationComplete: true })
  mockSubscriptions.mockResolvedValue([{ id: 'sub-1' }])
})

test('missing explicit Guru product configuration fails before any provider or local work', async () => {
  mockSettings.mockReturnValue({ guruClarezaMonthlyProductId: '', guruClarezaAnnualProductId: '' })
  await expect(syncAllProductSalesPerformance()).rejects.toThrow('Integration unavailable')
  expect(mockHistory).not.toHaveBeenCalled()
  expect(mockSubscriptions).not.toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
})

test.each([0, 1, 2])('incomplete Hotmart stream %i refuses replacing monthly totals', async stream => {
  for (let i = 0; i < 3; i++) mockHistory.mockResolvedValueOnce({ salesByEmail: new Map(), salesChecked: 0, paginationComplete: i !== stream })
  await expect(syncOgiSalesPerformance()).rejects.toThrow(/incomplet/i)
  expect(mockSave).not.toHaveBeenCalled()
})

test('incomplete Guru subscription transactions refuse replacing monthly totals', async () => {
  mockGet.mockRejectedValue(new Error('upstream timeout'))
  await expect(syncClarezaPlanSalesPerformance('CLAREZA_MENSAL')).rejects.toThrow(/incomplet/i)
  expect(mockSave).not.toHaveBeenCalled()
})

test('missing next cursor with more transactions fails closed', async () => {
  mockGet.mockResolvedValue({ data: { data: [], has_more_pages: 1, on_last_page: 0 } })
  await expect(syncClarezaPlanSalesPerformance('CLAREZA_MENSAL')).rejects.toThrow(/incomplet/i)
  expect(mockSave).not.toHaveBeenCalled()
})

test('ownership lost between provider completion and saving prevents monthly mutation', async () => {
  mockOwnership.mockImplementation(() => { throw new Error('lease lost') })
  await expect(syncOgiSalesPerformance()).rejects.toThrow('lease lost')
  expect(mockSave).not.toHaveBeenCalled()
})

test('complete all-years read streams beyond one batch and closes its cursor', async () => {
  const docs = Array.from({ length: 250 }, (_, index) => ({
    productKey: 'OGI', year: 1900 + Math.floor(index / 12), month: `${1900 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`,
    monthNum: index % 12 + 1, salesCount: 1, refundedCount: 0, revenueByCurrency: {}, refundedByCurrency: {}, lastSyncedAt: new Date('2026-09-08'),
  }))
  const close = jest.fn()
  const cursor = jest.fn(() => ({ async *[Symbol.asyncIterator]() { yield* docs }, close }))
  const sort = jest.fn(() => ({ maxTimeMS: () => ({ lean: () => ({ cursor }) }) }))
  mockFind.mockReturnValue({ sort })
  mockDistinct.mockReturnValue({ maxTimeMS: () => ({ exec: async () => [1901, 1900] }) })
  const result = await getProductSalesPerformance()
  expect(result.products[0].months).toHaveLength(250)
  expect(result.combined.salesCount).toBe(250)
  expect(result.availableYears).toEqual([1900, 1901])
  expect(sort).toHaveBeenCalledWith({ productKey: 1, month: 1, _id: 1 })
  expect(cursor).toHaveBeenCalledWith({ batchSize: 200 })
  expect(close).toHaveBeenCalledTimes(1)
})

test.each([1899, 2101, NaN, 2026.5])('invalid year %s fails before database reads', async year => {
  await expect(getProductSalesPerformance(year)).rejects.toMatchObject({ status: 400, code: 'PRODUCT_SALES_YEAR_INVALID' })
  expect(mockFind).not.toHaveBeenCalled()
  expect(mockDistinct).not.toHaveBeenCalled()
})
