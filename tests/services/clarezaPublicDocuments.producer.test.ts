import publicDocumentFixtures from '../fixtures/clareza/public-documents.json'
import responseCatalog from '../../src/contracts/response-contract-catalog.json'
import { createTestRuntimeConfig, resetRuntimeConfigForTests } from '../support/runtimeConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'

const mockCacheGet = jest.fn<Promise<unknown>, [string]>()
const mockCacheGetRaw = jest.fn<Promise<string | null>, [string]>()

jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    get: mockCacheGet,
    getRaw: mockCacheGetRaw,
    set: jest.fn(),
    setRaw: jest.fn(),
  },
}))
jest.mock('../../src/models/ClarezaMarketData', () => ({ __esModule: true, default: { findOne: jest.fn() } }))
jest.mock('../../src/models/ClarezaTop10Data', () => ({ __esModule: true, default: { findOne: jest.fn() } }))
jest.mock('../../src/models/ClarezaEarningsData', () => ({ __esModule: true, default: { findOne: jest.fn() } }))

import { getClarezaData } from '../../src/services/clareza/clarezaFmpData.service'
import { getClarezaTop10Json } from '../../src/services/clareza/clarezaTop10Service'
import { getClarezaEarningsData } from '../../src/services/clareza/clarezaEarningsService'
import { getReitAnalysis, getReitValuation } from '../../src/services/clareza/clarezaFmpReit.service'
import { getStockAnalysis } from '../../src/services/clareza/clarezaFmpStock.service'
import { getRaioxJson, searchRaiox } from '../../src/services/clareza/raiox/runtime'

describe('Clareza public-document producer fixtures', () => {
  test.each(publicDocumentFixtures.documents)(
    '$identity records a successful serialization mode and producer provenance',
    (fixture) => {
      expect(fixture.status).toBe(200)
      expect(fixture.provenance).toEqual(expect.objectContaining({
        sourceCommit: 'b300df5fa6fb0450fd57dfd94ea77cb1f2ec00d2',
        producer: expect.any(String),
      }))
      expect(['json', 'raw']).toContain(fixture.bodyMode)
      if (fixture.bodyMode === 'raw') {
        expect(fixture.rawBody).toBe(JSON.stringify(fixture.body))
      }
    },
  )
})

function fixture(identity: string, requestPath: string) {
  const found = publicDocumentFixtures.documents.find((entry) => entry.identity === identity && entry.requestPath === requestPath)
  if (!found) throw new Error(`Missing fixture ${identity} ${requestPath}`)
  return found
}

function configureFmp(): void {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      fmp: { configured: true, value: { apiKey: 'fixture-fmp-key' } },
    },
  })
}

test('reconciles every fixed JSON top-level shape with the reviewed catalog and documents dynamic records', () => {
  for (const document of publicDocumentFixtures.documents) {
    const catalog = responseCatalog.find((entry) => `${entry.method} ${entry.path}` === document.identity)
    if (!catalog) throw new Error(`Missing catalog decision for ${document.identity}`)
    if (document.dynamicRecordException !== null) {
      expect(document.dynamicRecordException.length).toBeGreaterThan(0)
      continue
    }
    expect(Array.isArray(document.body) ? [] : Object.keys(document.body).sort()).toEqual(catalog.shapeKeys)
  }
})
describe('cache-backed Clareza producers', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    resetRuntimeConfigForTests()
  })

  afterEach(() => {
    resetRuntimeConfigForTests()
  })

  test('returns the documented market-data cache payload without a provider call', async () => {
    const entry = fixture('GET /api/clareza/data', '/data')
    mockCacheGet.mockResolvedValueOnce(entry.body)

    await expect(getClarezaData()).resolves.toEqual(entry.body)
  })

  test('returns the documented serialized Top 10 payload byte-for-byte from cache', async () => {
    const entry = fixture('GET /api/clareza/top10', '/top10')
    if (entry.rawBody === null) throw new Error('Top 10 fixture requires rawBody')
    mockCacheGetRaw.mockResolvedValueOnce(entry.rawBody)

    await expect(getClarezaTop10Json()).resolves.toBe(entry.rawBody)
  })

  test('returns the documented cached earnings document without a provider call', async () => {
    const entry = fixture('GET /api/clareza/earnings/data', '/earnings/data')
    mockCacheGet.mockResolvedValueOnce(entry.body)

    await expect(getClarezaEarningsData()).resolves.toEqual(entry.body)
  })

  test.each([
    ['GET /api/clareza/reit/:ticker', '/reit/O', getReitAnalysis],
    ['GET /api/clareza/reit-valuation/:ticker', '/reit-valuation/O', getReitValuation],
    ['GET /api/clareza/stock/:ticker', '/stock/AAPL', getStockAnalysis],
  ])('returns the documented dynamic cache record for %s', async (identity, requestPath, producer) => {
    const entry = fixture(identity, requestPath)
    configureFmp()
    mockCacheGet.mockResolvedValueOnce(entry.body)

    await expect(producer(requestPath.split('/').at(-1) ?? '')).resolves.toEqual(entry.body)
  })

  test('returns the documented serialized Raio-X payload byte-for-byte from cache', async () => {
    const entry = fixture('GET /api/clareza/raiox/:ticker', '/raiox/AAPL')
    if (entry.rawBody === null) throw new Error('Raio-X fixture requires rawBody')
    mockCacheGetRaw.mockResolvedValueOnce(entry.rawBody)

    await expect(getRaioxJson('AAPL')).resolves.toBe(entry.rawBody)
  })

  test('builds the documented Raio-X search document from its cached index', async () => {
    const entry = fixture('GET /api/clareza/raiox-search', '/raiox-search?q=apple')
    mockCacheGet.mockResolvedValueOnce([
      { symbol: 'AAPL', name: 'Apple Inc.', price: null, image: null, currency: null, exchange: null, country: null },
    ])

    await expect(searchRaiox('apple')).resolves.toEqual(entry.body)
  })
})