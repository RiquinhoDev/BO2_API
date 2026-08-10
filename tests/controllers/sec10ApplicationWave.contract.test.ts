import request from 'supertest'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

type AsyncBoundaryMock = jest.Mock<Promise<unknown>, unknown[]>

const mockGetClarezaData: AsyncBoundaryMock = jest.fn()
const mockRefreshClarezaData: AsyncBoundaryMock = jest.fn()
const mockGetReitAnalysis: AsyncBoundaryMock = jest.fn()
const mockGetReitValuation: AsyncBoundaryMock = jest.fn()
const mockGetStockAnalysis: AsyncBoundaryMock = jest.fn()
const mockGetClarezaTop10Json: AsyncBoundaryMock = jest.fn()
const mockRefreshClarezaTop10Data: AsyncBoundaryMock = jest.fn()
const mockGetRaioxJson: AsyncBoundaryMock = jest.fn()
const mockSearchRaiox: AsyncBoundaryMock = jest.fn()
const mockRefreshClarezaRaioxData: AsyncBoundaryMock = jest.fn()
const mockDiagnoseRaiox: AsyncBoundaryMock = jest.fn()
const mockGetClarezaCarteiraData: AsyncBoundaryMock = jest.fn()
const mockSearchCarteira: AsyncBoundaryMock = jest.fn()
const mockRefreshClarezaCarteiraData: AsyncBoundaryMock = jest.fn()
const mockGetClarezaEarningsData: AsyncBoundaryMock = jest.fn()
const mockRefreshClarezaEarningsData: AsyncBoundaryMock = jest.fn()
const mockIsClarezaRefreshAuthorized = jest.fn<boolean, [string]>()

jest.mock('../../src/security/clarezaRefreshAuthorization', () => ({
  isClarezaRefreshAuthorized: mockIsClarezaRefreshAuthorized,
}))

jest.mock('../../src/services/clareza/clarezaFmpService', () => ({
  getClarezaData: mockGetClarezaData,
  refreshClarezaData: mockRefreshClarezaData,
  getReitAnalysis: mockGetReitAnalysis,
  getReitValuation: mockGetReitValuation,
  getStockAnalysis: mockGetStockAnalysis,
}))

jest.mock('../../src/services/clareza/clarezaTop10Service', () => ({
  getClarezaTop10Json: mockGetClarezaTop10Json,
  refreshClarezaTop10Data: mockRefreshClarezaTop10Data,
}))

jest.mock('../../src/services/clareza/clarezaRaioxService', () => ({
  getRaioxJson: mockGetRaioxJson,
  searchRaiox: mockSearchRaiox,
  refreshClarezaRaioxData: mockRefreshClarezaRaioxData,
  diagnoseRaiox: mockDiagnoseRaiox,
}))

jest.mock('../../src/services/clareza/carteira/carteira.runtime', () => ({
  getClarezaCarteiraData: mockGetClarezaCarteiraData,
  searchCarteira: mockSearchCarteira,
  refreshClarezaCarteiraData: mockRefreshClarezaCarteiraData,
}))

jest.mock('../../src/services/clareza/clarezaEarningsService', () => ({
  getClarezaEarningsData: mockGetClarezaEarningsData,
  refreshClarezaEarningsData: mockRefreshClarezaEarningsData,
}))

import clarezaRouter from '../../src/routes/clareza.routes'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '?__bo2_offline_loopback=1'

interface ClarezaOperation {
  name: string
  method: 'get' | 'post'
  path: string
  dependency: AsyncBoundaryMock
  code: string
  message: string
}

const clarezaOperations: ClarezaOperation[] = [
  { name: 'read market data', method: 'get', path: '/data', dependency: mockGetClarezaData, code: 'CLAREZA_DATA_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh market data', method: 'post', path: '/refresh', dependency: mockRefreshClarezaData, code: 'CLAREZA_DATA_REFRESH_FAILED', message: 'Erro interno do servidor' },
  { name: 'read REIT valuation', method: 'get', path: '/reit-valuation/O', dependency: mockGetReitValuation, code: 'CLAREZA_REIT_VALUATION_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'read REIT analysis', method: 'get', path: '/reit/O', dependency: mockGetReitAnalysis, code: 'CLAREZA_REIT_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'read stock analysis', method: 'get', path: '/stock/AAPL', dependency: mockGetStockAnalysis, code: 'CLAREZA_STOCK_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'read Top 10', method: 'get', path: '/top10', dependency: mockGetClarezaTop10Json, code: 'CLAREZA_TOP10_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh Top 10', method: 'post', path: '/top10/refresh', dependency: mockRefreshClarezaTop10Data, code: 'CLAREZA_TOP10_REFRESH_FAILED', message: 'Erro interno do servidor' },
  { name: 'read Raio-X query', method: 'get', path: '/raiox?symbol=AAPL', dependency: mockGetRaioxJson, code: 'CLAREZA_RAIOX_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'search Raio-X query', method: 'get', path: '/raiox?search=apple', dependency: mockSearchRaiox, code: 'CLAREZA_RAIOX_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'search Raio-X', method: 'get', path: '/raiox-search?q=apple', dependency: mockSearchRaiox, code: 'CLAREZA_RAIOX_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'diagnose Raio-X', method: 'get', path: '/raiox-diagnose', dependency: mockDiagnoseRaiox, code: 'CLAREZA_RAIOX_DIAGNOSE_FAILED', message: 'Erro interno do servidor' },
  { name: 'read Raio-X ticker', method: 'get', path: '/raiox/AAPL', dependency: mockGetRaioxJson, code: 'CLAREZA_RAIOX_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh Raio-X', method: 'post', path: '/raiox/refresh', dependency: mockRefreshClarezaRaioxData, code: 'CLAREZA_RAIOX_REFRESH_FAILED', message: 'Erro interno do servidor' },
  { name: 'read portfolio', method: 'get', path: '/carteira/data', dependency: mockGetClarezaCarteiraData, code: 'CLAREZA_CARTEIRA_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'search portfolio', method: 'get', path: '/carteira-search?q=apple', dependency: mockSearchCarteira, code: 'CLAREZA_CARTEIRA_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh portfolio', method: 'post', path: '/carteira/refresh', dependency: mockRefreshClarezaCarteiraData, code: 'CLAREZA_CARTEIRA_REFRESH_FAILED', message: 'Erro interno do servidor' },
  { name: 'read earnings', method: 'get', path: '/earnings/data', dependency: mockGetClarezaEarningsData, code: 'CLAREZA_EARNINGS_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh earnings', method: 'post', path: '/earnings/refresh', dependency: mockRefreshClarezaEarningsData, code: 'CLAREZA_EARNINGS_REFRESH_FAILED', message: 'Erro interno do servidor' },
]

describe('SEC-10 remaining application wave', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockIsClarezaRefreshAuthorized.mockReturnValue(true)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Clareza router', () => {
    it('covers all 12 literal sites and five dynamic unexpected-500 branches', () => {
      expect(clarezaOperations).toHaveLength(18)
      expect(new Set(clarezaOperations.map(({ code }) => code)).size).toBe(16)
    })

    it.each(clarezaOperations)('$name returns its stable redacted central envelope', async (operation) => {
      operation.dependency.mockRejectedValueOnce(secret)
      const app = appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter })
      const requestPath = `${operation.path}${operation.path.includes('?') ? '&' : '?'}${offline.slice(1)}`
      const response = operation.method === 'get'
        ? await request(app).get(requestPath)
        : await request(app).post(operation.path + offline).send({})

      expectCentralError(response, { code: operation.code, message: operation.message })
    })

    it('normalizes a non-Error rejection without exposing it', async () => {
      mockGetClarezaData.mockRejectedValueOnce('secret alice@example.test token=hidden')
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/data' + offline)

      expectCentralError(response, {
        code: 'CLAREZA_DATA_READ_FAILED',
        message: 'Erro interno do servidor',
      })
    })

    it('preserves refresh authorization precedence', async () => {
      mockIsClarezaRefreshAuthorized.mockReturnValueOnce(false)
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .post('/refresh' + offline)
        .send({})

      expect(response.status).toBe(403)
      expect(response.body).toEqual({ error: 'Refresh Clareza nao autorizado' })
    })

    it('preserves the unavailable-data response', async () => {
      mockGetClarezaData.mockResolvedValueOnce(null)
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/data' + offline)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ error: 'Dados indisponíveis. Tente novamente em breve.' })
    })

    it('preserves the intentional missing-symbol validation response', async () => {
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/raiox' + offline)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Parâmetro symbol ou search em falta.' })
    })

    it('preserves typed not-found handling without leaking through the central boundary', async () => {
      mockGetRaioxJson.mockRejectedValueOnce(new Error('Ticker nao encontrado'))
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/raiox/MISSING' + offline)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'Ticker nao encontrado' })
    })
  })
})
