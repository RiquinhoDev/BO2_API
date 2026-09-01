import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
installTestRuntimeConfigHooks()
import request from 'supertest'
import { createApp } from '../../src/app'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { createErrorHandling } from '../../src/security/errorHandling'
import { createHttpPerimeter } from '../../src/security/httpPerimeter'
import { configureJwt, signAppToken } from '../../src/security/jwt'

const mockSearchComparador = jest.fn()
const mockSearchPublishedComparador = jest.fn()
const mockRefreshClarezaComparadorData = jest.fn()
const mockIsClarezaRefreshAuthorized = jest.fn<boolean, [string]>()

jest.mock('../../src/services/clareza/comparador/comparador.runtime', () => ({
  getComparadorSymbols: jest.fn(),
  searchComparador: mockSearchComparador,
  refreshComparadorSymbols: jest.fn(),
  refreshClarezaComparadorData: mockRefreshClarezaComparadorData,
}))

jest.mock('../../src/services/clareza/core/corePublished.runtime', () => ({
  getPublishedRadar: jest.fn(), getPublishedCarteira: jest.fn(), getPublishedPortfolioAnalysis: jest.fn(),
  getPublishedPortfolioHistory: jest.fn(), getPublishedRaiox: jest.fn(), searchPublishedRaiox: jest.fn(),
  getPublishedComparador: jest.fn(),
  searchPublishedComparador: mockSearchPublishedComparador,
  getPublishedEarnings: jest.fn(),
}))

jest.mock('../../src/security/clarezaRefreshAuthorization', () => ({
  isClarezaRefreshAuthorized: mockIsClarezaRefreshAuthorized,
}))

jest.mock('../../src/services/clareza/clarezaFmpService', () => ({
  getClarezaData: jest.fn(), refreshClarezaData: jest.fn(), getReitAnalysis: jest.fn(),
  getReitValuation: jest.fn(), getStockAnalysis: jest.fn(),
}))
jest.mock('../../src/services/clareza/clarezaTop10Service', () => ({ getClarezaTop10Json: jest.fn(), refreshClarezaTop10Data: jest.fn() }))
jest.mock('../../src/services/clareza/clarezaRaioxService', () => ({ getRaioxJson: jest.fn(), searchRaiox: jest.fn(), startRaioxRefresh: jest.fn(), readRaioxRefreshStatus: jest.fn(), diagnoseRaiox: jest.fn() }))
jest.mock('../../src/services/clareza/carteira/carteira.runtime', () => ({ getClarezaCarteiraData: jest.fn(), searchCarteira: jest.fn(), refreshClarezaCarteiraData: jest.fn() }))
jest.mock('../../src/services/clareza/clarezaEarningsService', () => ({ getClarezaEarningsData: jest.fn(), refreshClarezaEarningsData: jest.fn() }))

import { registerRoutes } from '../../src/runtime/registerRoutes'

const marker = { __bo2_offline_loopback: '1' }
const jwtSecret = 'clareza-comparator-production-mount-jwt-secret'

function productionApp(correlationId = 'comparador-production-request') {
  return createApp({
    authEnforce: true,
    allowedOrigins: ['http://localhost:3000'],
    createHttpPerimeter: () => createHttpPerimeter({
      limits: {
        login: { limit: 10_000, windowMs: 60_000 },
        webhook: { limit: 10_000, windowMs: 60_000 },
        heavy: { limit: 10_000, windowMs: 60_000 },
      },
    }),
    createErrorHandling: () => createErrorHandling({ generateCorrelationId: () => correlationId, logError: () => undefined }),
    registerRoutes,
  })
}

function tokenFor(role: 'ADMIN' | 'SUPER_ADMIN'): string {
  return signAppToken({
    id: `test-${role.toLowerCase()}`,
    email: 'operator@example.test',
    role,
    permissions: [],
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  configureJwt({
    jwtSecret,
    oldApiJwtSecret: 'clareza-comparator-production-mount-old-secret',
    studentAccessJwtSecret: 'clareza-comparator-production-mount-student-secret',
  })
})

describe('Clareza comparator production mount contract', () => {
  it('keeps GET public while default-deny protects refresh before Clareza token authorization', async () => {
    mockSearchPublishedComparador.mockResolvedValueOnce({ query: 'APPLE', count: 1, results: [] })
    const app = productionApp()

    const publicRead = await request(app).get('/api/clareza/comparador').query({ ...marker, search: 'apple' })
    expect(publicRead.status).toBe(200)
    expect(publicRead.body).toEqual({ query: 'APPLE', count: 1, results: [] })

    const publicValidation = await request(app).get('/api/clareza/comparador').query(marker)
    expect(publicValidation.status).toBe(400)
    expect(publicValidation.body).toEqual({ error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.' })

    const unauthenticatedRefresh = await request(app).post('/api/clareza/comparador/refresh').query(marker).send({})
    expect(unauthenticatedRefresh.status).toBe(401)
    expect(mockIsClarezaRefreshAuthorized).not.toHaveBeenCalled()

    mockIsClarezaRefreshAuthorized.mockReturnValueOnce(false)
    const badClarezaToken = await request(app)
      .post('/api/clareza/comparador/refresh')
      .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN')}`)
      .query(marker)
      .send({})
    expect(badClarezaToken.status).toBe(403)
    expect(badClarezaToken.body).toEqual({ error: 'Refresh Clareza nao autorizado' })
    expect(mockIsClarezaRefreshAuthorized).toHaveBeenCalledTimes(1)
    expect(mockRefreshClarezaComparadorData).not.toHaveBeenCalled()
  })

  it('rejects ADMIN before checking the Clareza credential or calling refresh', async () => {
    mockIsClarezaRefreshAuthorized.mockReturnValue(true)
    const response = await request(productionApp())
      .post('/api/clareza/comparador/refresh')
      .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
      .query(marker)
      .send({})

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      success: false,
      message: 'Sem permissões suficientes',
    })
    expect(mockIsClarezaRefreshAuthorized).not.toHaveBeenCalled()
    expect(mockRefreshClarezaComparadorData).not.toHaveBeenCalled()
  })

  it('allows SUPER_ADMIN through the Clareza credential and preserves the success envelope', async () => {
    const report = { ok: true, updated: ['EXM'], failed: [] }
    mockIsClarezaRefreshAuthorized.mockReturnValueOnce(true)
    mockRefreshClarezaComparadorData.mockResolvedValueOnce(report)

    const response = await request(productionApp())
      .post('/api/clareza/comparador/refresh')
      .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN')}`)
      .set('x-clareza-refresh-token', 'synthetic-test-credential')
      .query(marker)
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, data: report })
    expect(mockIsClarezaRefreshAuthorized)
      .toHaveBeenCalledWith('synthetic-test-credential')
    expect(mockRefreshClarezaComparadorData).toHaveBeenCalledTimes(1)
  })

  it('preserves integration and SEC-10 failures through the production middleware chain', async () => {
    const app = productionApp('comparador-production-error')
    mockIsClarezaRefreshAuthorized.mockReturnValueOnce(true)
    mockRefreshClarezaComparadorData.mockRejectedValueOnce(new IntegrationUnavailableError('fmp'))

    const unavailable = await request(app)
      .post('/api/clareza/comparador/refresh')
      .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN')}`)
      .query(marker)
      .send({})
    expect(unavailable.status).toBe(503)
    expect(unavailable.body).toEqual({
      success: false,
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível',
      correlationId: 'comparador-production-error',
    })
    expect(mockRefreshClarezaComparadorData).toHaveBeenCalledTimes(1)

    mockSearchPublishedComparador.mockRejectedValueOnce(new Error('secret token'))
    const unexpected = await request(app).get('/api/clareza/comparador').query({ ...marker, search: 'apple' })
    expect(unexpected.status).toBe(500)
    expect(unexpected.body).toEqual({
      success: false,
      code: 'CLAREZA_COMPARADOR_SEARCH_FAILED',
      message: 'Erro interno do servidor',
      correlationId: 'comparador-production-error',
    })
  })
})
