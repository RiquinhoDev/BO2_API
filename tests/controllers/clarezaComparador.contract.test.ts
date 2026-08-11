import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
installTestRuntimeConfigHooks()
import request from 'supertest'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { ComparadorPolicyError } from '../../src/services/clareza/comparador/comparadorPolicy'
import type {
  ComparadorRefreshReport,
  ComparadorSearchResponse,
  ComparadorSymbolsResponse,
} from '../../src/services/clareza/comparador/comparador.types'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

const mockGetComparadorSymbols = jest.fn<Promise<ComparadorSymbolsResponse>, [string]>()
const mockSearchComparador = jest.fn<Promise<ComparadorSearchResponse>, [string]>()
const mockRefreshComparadorSymbols = jest.fn<Promise<ComparadorRefreshReport>, [string]>()
const mockRefreshClarezaComparadorData = jest.fn<Promise<{ readonly total: number; readonly errors: number }>, []>()
const mockIsClarezaRefreshAuthorized = jest.fn<boolean, [string]>()

jest.mock('../../src/services/clareza/comparador/comparador.runtime', () => ({
  getComparadorSymbols: mockGetComparadorSymbols,
  searchComparador: mockSearchComparador,
  refreshComparadorSymbols: mockRefreshComparadorSymbols,
  refreshClarezaComparadorData: mockRefreshClarezaComparadorData,
}))

jest.mock('../../src/security/clarezaRefreshAuthorization', () => ({
  isClarezaRefreshAuthorized: mockIsClarezaRefreshAuthorized,
}))

jest.mock('../../src/services/clareza/clarezaFmpService', () => ({
  getClarezaData: jest.fn(), refreshClarezaData: jest.fn(), getReitAnalysis: jest.fn(),
  getReitValuation: jest.fn(), getStockAnalysis: jest.fn(),
}))
jest.mock('../../src/services/clareza/clarezaTop10Service', () => ({ getClarezaTop10Json: jest.fn(), refreshClarezaTop10Data: jest.fn() }))
jest.mock('../../src/services/clareza/clarezaRaioxService', () => ({ getRaioxJson: jest.fn(), searchRaiox: jest.fn(), refreshClarezaRaioxData: jest.fn(), diagnoseRaiox: jest.fn() }))
jest.mock('../../src/services/clareza/carteira/carteira.runtime', () => ({ getClarezaCarteiraData: jest.fn(), searchCarteira: jest.fn(), refreshClarezaCarteiraData: jest.fn() }))
jest.mock('../../src/services/clareza/clarezaEarningsService', () => ({ getClarezaEarningsData: jest.fn(), refreshClarezaEarningsData: jest.fn() }))

import clarezaRouter from '../../src/routes/clareza.routes'

const offline = '?__bo2_offline_loopback=1'

const company = {
  ticker: 'AAPL', name: 'Apple Inc.', image: null, sector: 'Technology', industry: null,
  country: null, currency: 'USD', exchange: 'NASDAQ', isReit: false, price: 100,
  change: null, perf12m: null, marketCap: null, beta: null, pe: null, peg: null, ps: null,
  pb: null, evEbitda: null, pFfo: null, grossMargin: null, netMargin: null, roe: null,
  roic: null, fcfYield: null, debtEquity: null, debtEbitda: null, dividendYield: null,
  payoutRatio: null, ffoPayout: null, analystConsensus: null, strongBuy: null, buy: null,
  hold: null, sell: null, strongSell: null, targetConsensus: null, upside: null,
  updated: '2026-08-11T09:30:00.000Z',
} as const

describe('Clareza comparator HTTP contract', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockIsClarezaRefreshAuthorized.mockReturnValue(true)
  })

  it('preserves the search document and its short public cache lifetime', async () => {
    mockSearchComparador.mockResolvedValue({
      query: 'APPLE', count: 1,
      results: [{ symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ', image: null, isReit: false }],
    })

    const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
      .get('/comparador?search=apple&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('public, max-age=600')
    expect(response.body).toEqual({
      query: 'APPLE', count: 1,
      results: [{ symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ', image: null, isReit: false }],
    })
    expect(mockSearchComparador).toHaveBeenCalledWith('apple')
  })

  it('preserves the comparison document and its long public cache lifetime', async () => {
    mockGetComparadorSymbols.mockResolvedValue({
      count: 2, updated: '2026-08-11T09:30:00.000Z',
      companies: [company, { ticker: 'MSFT', error: 'MSFT ainda nao esta disponivel no Comparador.' }],
    })

    const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
      .get('/comparador?symbols=AAPL,MSFT&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('public, max-age=3600')
    expect(response.body).toEqual({
      count: 2, updated: '2026-08-11T09:30:00.000Z',
      companies: [company, { ticker: 'MSFT', error: 'MSFT ainda nao esta disponivel no Comparador.' }],
    })
    expect(mockGetComparadorSymbols).toHaveBeenCalledWith('AAPL,MSFT')
  })

  it('keeps comparator query validation in the legacy 400 shape', async () => {
    const app = appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter })
    const absent = await request(app).get('/comparador' + offline)
    expect(absent.status).toBe(400)
    expect(absent.body).toEqual({ error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.' })

    mockGetComparadorSymbols.mockRejectedValueOnce(new ComparadorPolicyError('EMPTY_SYMBOLS', 'Sem simbolos validos.'))
    const invalid = await request(app).get('/comparador?symbols=invalid/ticker&__bo2_offline_loopback=1')
    expect(invalid.status).toBe(400)
    expect(invalid.body).toEqual({ error: 'Sem simbolos validos.' })
  })

  it('protects refresh, preserves manual-symbol success, and limits its input in the service boundary', async () => {
    mockIsClarezaRefreshAuthorized.mockReturnValueOnce(false)
    const app = appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter })
    const denied = await request(app).post('/comparador/refresh?symbols=AAPL&__bo2_offline_loopback=1').send({})
    expect(denied.status).toBe(403)
    expect(denied.body).toEqual({ error: 'Refresh Clareza nao autorizado' })

    mockRefreshComparadorSymbols.mockResolvedValueOnce({ ok: true, updated: ['AAPL'], failed: [] })
    const refreshed = await request(app).post('/comparador/refresh?symbols=AAPL&__bo2_offline_loopback=1').send({})
    expect(refreshed.status).toBe(200)
    expect(refreshed.body).toEqual({ ok: true, updated: ['AAPL'], failed: [] })
    expect(mockRefreshComparadorSymbols).toHaveBeenCalledWith('AAPL')

    mockRefreshComparadorSymbols.mockRejectedValueOnce(new ComparadorPolicyError('EMPTY_SYMBOLS', 'Sem simbolos validos.'))
    const invalid = await request(app).post('/comparador/refresh?symbols=invalid/ticker&__bo2_offline_loopback=1').send({})
    expect(invalid.status).toBe(400)
    expect(invalid.body).toEqual({ error: 'Sem simbolos validos.' })
  })

  it('preserves full refresh, integration unavailability, and central SEC-10 failures', async () => {
    mockRefreshClarezaComparadorData.mockResolvedValueOnce({ total: 45, errors: 2 })
    const app = appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter })
    const refreshed = await request(app).post('/comparador/refresh' + offline).send({})
    expect(refreshed.status).toBe(200)
    expect(refreshed.body).toEqual({ success: true, total: 45, errors: 2 })

    mockRefreshClarezaComparadorData.mockRejectedValueOnce(new IntegrationUnavailableError('fmp'))
    const unavailable = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }, 'comparador-unavailable'))
      .post('/comparador/refresh' + offline).send({})
    expect(unavailable.status).toBe(503)
    expect(unavailable.body).toEqual({
      success: false, code: 'INTEGRATION_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível', correlationId: 'comparador-unavailable',
    })

    mockSearchComparador.mockRejectedValueOnce(new Error('secret token'))
    const failed = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }, 'comparador-failure'))
      .get('/comparador?search=apple&__bo2_offline_loopback=1')
    expectCentralError(failed, { code: 'CLAREZA_COMPARADOR_SEARCH_FAILED', message: 'Erro interno do servidor', correlationId: 'comparador-failure' })
  })
})
