import request from 'supertest'
import publicDocumentFixtures from '../fixtures/clareza/public-documents.json'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
installTestRuntimeConfigHooks()
import { appForCentralError } from '../support/centralErrorContract'

const mockGetClarezaData = jest.fn<Promise<unknown>, []>()
const mockGetReitAnalysis = jest.fn<Promise<unknown>, [string]>()
const mockGetReitValuation = jest.fn<Promise<unknown>, [string]>()
const mockGetStockAnalysis = jest.fn<Promise<unknown>, [string]>()
const mockGetClarezaTop10Json = jest.fn<Promise<string>, []>()
const mockGetRaioxJson = jest.fn<Promise<string>, [string]>()
const mockSearchRaiox = jest.fn<Promise<unknown>, [string]>()
const mockDiagnoseRaiox = jest.fn<Promise<unknown>, []>()
const mockGetClarezaCarteiraData = jest.fn<Promise<unknown>, []>()
const mockSearchCarteira = jest.fn<Promise<unknown>, [string]>()
const mockGetClarezaEarningsData = jest.fn<Promise<unknown>, []>()
const mockGetComparadorSymbols = jest.fn<Promise<unknown>, [string]>()
const mockSearchComparador = jest.fn<Promise<unknown>, [string]>()
const mockGetPublishedCarteira = jest.fn<Promise<unknown>, []>()
const mockSearchPublishedCarteira = jest.fn<Promise<unknown>, [string]>()
const mockGetPublishedRaiox = jest.fn<Promise<unknown>, [string]>()
const mockSearchPublishedRaiox = jest.fn<Promise<unknown>, [string]>()
const mockGetPublishedComparador = jest.fn<Promise<unknown>, [string]>()
const mockSearchPublishedComparador = jest.fn<Promise<unknown>, [string]>()

jest.mock('../../src/services/clareza/clarezaFmpService', () => ({
  getClarezaData: mockGetClarezaData,
  refreshClarezaData: jest.fn(),
  getReitAnalysis: mockGetReitAnalysis,
  getReitValuation: mockGetReitValuation,
  getStockAnalysis: mockGetStockAnalysis,
}))
jest.mock('../../src/services/clareza/clarezaTop10Service', () => ({
  getClarezaTop10Json: mockGetClarezaTop10Json,
  refreshClarezaTop10Data: jest.fn(),
}))
jest.mock('../../src/services/clareza/clarezaRaioxService', () => ({
  startRaioxRefresh: jest.fn(),
  readRaioxRefreshStatus: jest.fn(),
  getRaioxJson: mockGetRaioxJson,
  searchRaiox: mockSearchRaiox,
  refreshClarezaRaioxData: jest.fn(),
  diagnoseRaiox: mockDiagnoseRaiox,
}))
jest.mock('../../src/services/clareza/carteira/carteira.runtime', () => ({
  getClarezaCarteiraData: mockGetClarezaCarteiraData,
  searchCarteira: mockSearchCarteira,
  refreshClarezaCarteiraData: jest.fn(),
}))
jest.mock('../../src/services/clareza/clarezaEarningsService', () => ({
  getClarezaEarningsData: mockGetClarezaEarningsData,
  refreshClarezaEarningsData: jest.fn(),
}))
jest.mock('../../src/services/clareza/comparador/comparador.runtime', () => ({
  getComparadorSymbols: mockGetComparadorSymbols,
  searchComparador: mockSearchComparador,
  refreshComparadorSymbols: jest.fn(),
  refreshClarezaComparadorData: jest.fn(),
}))
jest.mock('../../src/services/clareza/core/corePublished.runtime', () => ({
  getPublishedRadar: jest.fn(),
  getPublishedCarteira: mockGetPublishedCarteira,
  getPublishedPortfolioAnalysis: jest.fn(),
  getPublishedRaiox: mockGetPublishedRaiox,
  searchPublishedRaiox: mockSearchPublishedRaiox,
  getPublishedComparador: mockGetPublishedComparador,
  searchPublishedComparador: mockSearchPublishedComparador,
}))
jest.mock('../../src/services/clareza/core/coreCarteiraSearch.runtime', () => ({
  searchPublishedCarteira: mockSearchPublishedCarteira,
}))

import clarezaRouter from '../../src/routes/clareza.routes'

const offlineSuffix = '__bo2_offline_loopback=1'
const publicDocumentIdentities = [
  'GET /api/clareza/carteira-search',
  'GET /api/clareza/carteira/data',
  'GET /api/clareza/comparador',
  'GET /api/clareza/data',
  'GET /api/clareza/earnings/data',
  'GET /api/clareza/raiox',
  'GET /api/clareza/raiox-diagnose',
  'GET /api/clareza/raiox-search',
  'GET /api/clareza/raiox/:ticker',
  'GET /api/clareza/reit-valuation/:ticker',
  'GET /api/clareza/reit/:ticker',
  'GET /api/clareza/stock/:ticker',
  'GET /api/clareza/top10',
]

function requestPath(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${offlineSuffix}`
}

function isCanonicalSuccessWrapper(value: unknown, expectedData: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Reflect.get(value, 'success') === true
    && Object.prototype.hasOwnProperty.call(value, 'data')
    && JSON.stringify(Reflect.get(value, 'data')) === JSON.stringify(expectedData)
}
function configureDocument(path: string, body: unknown, rawBody: string | null): void {
  if (path === '/data') {
    mockGetClarezaData.mockResolvedValueOnce(body)
  } else if (path === '/top10') {
    mockGetClarezaTop10Json.mockResolvedValueOnce(rawBody ?? JSON.stringify(body))
  } else if (path.startsWith('/reit-valuation/')) {
    mockGetReitValuation.mockResolvedValueOnce(body)
  } else if (path.startsWith('/reit/')) {
    mockGetReitAnalysis.mockResolvedValueOnce(body)
  } else if (path.startsWith('/stock/')) {
    mockGetStockAnalysis.mockResolvedValueOnce(body)
  } else if (path === '/raiox-diagnose') {
    mockDiagnoseRaiox.mockResolvedValueOnce(body)
  } else if (path.startsWith('/raiox-search')) {
    mockSearchRaiox.mockResolvedValueOnce(body)
  } else if (path.startsWith('/raiox?search=')) {
    mockSearchPublishedRaiox.mockResolvedValueOnce(body)
  } else if (path.startsWith('/raiox')) {
    mockGetPublishedRaiox.mockResolvedValueOnce(body)
  } else if (path === '/carteira/data') {
    mockGetPublishedCarteira.mockResolvedValueOnce(body)
  } else if (path.startsWith('/carteira-search')) {
    mockSearchCarteira.mockResolvedValueOnce(body)
  } else if (path.startsWith('/carteira/search')) {
    mockSearchPublishedCarteira.mockResolvedValueOnce(body)
  } else if (path === '/earnings/data') {
    mockGetClarezaEarningsData.mockResolvedValueOnce(body)
  } else if (path.startsWith('/comparador?symbols=')) {
    mockGetPublishedComparador.mockResolvedValueOnce(body)
  } else if (path.startsWith('/comparador?search=')) {
    mockSearchPublishedComparador.mockResolvedValueOnce(body)
  } else {
    throw new Error(`Missing Clareza public-document fixture arrangement for ${path}`)
  }
}

describe('Clareza public documents', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('has a finite thirteen-identity public-document fixture set', () => {
    const identities = publicDocumentFixtures.documents.map((fixture) => fixture.identity)
    expect([...new Set(identities)].sort()).toEqual(publicDocumentIdentities)
    expect(publicDocumentFixtures.documents).toHaveLength(15)
  })

  test('canonical Carteira search alias preserves the reviewed search document', async () => {
    const body = { query: 'apple', count: 1, results: [{ ticker: 'AAPL', name: 'Apple Inc.' }] }
    mockSearchPublishedCarteira.mockResolvedValueOnce(body)

    const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
      .get(requestPath('/carteira/search?q=apple'))

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('public, max-age=600')
    expect(response.body).toEqual(body)
  })

  test.each(publicDocumentFixtures.documents)(
    '$identity preserves the documented $requestPath payload, status, and cache header',
    async (fixture) => {
      configureDocument(fixture.requestPath, fixture.body, fixture.rawBody)

      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get(requestPath(fixture.requestPath))

      expect(response.status).toBe(fixture.status)
      expect(response.headers['cache-control']).toBe(fixture.cacheControl ?? undefined)
      if (fixture.bodyMode === 'raw') {
        expect(response.text).toBe(fixture.rawBody)
        expect(JSON.parse(response.text)).toEqual(fixture.body)
      } else {
        expect(response.body).toEqual(fixture.body)
        expect(response.text).toBe(JSON.stringify(fixture.body))
      }
      expect(isCanonicalSuccessWrapper(response.body, fixture.body)).toBe(false)
    },
  )
})
