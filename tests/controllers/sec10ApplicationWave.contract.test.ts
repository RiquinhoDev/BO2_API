import request from 'supertest'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
installTestRuntimeConfigHooks()
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
const mockStartRaioxRefresh: AsyncBoundaryMock = jest.fn()
const mockReadRaioxRefreshStatus: AsyncBoundaryMock = jest.fn()
const mockDiagnoseRaiox: AsyncBoundaryMock = jest.fn()
const mockGetPublishedRaiox: AsyncBoundaryMock = jest.fn()
const mockSearchPublishedRaiox: AsyncBoundaryMock = jest.fn()
const mockGetPublishedCarteira: AsyncBoundaryMock = jest.fn()
const mockGetPublishedComparador: AsyncBoundaryMock = jest.fn()
const mockSearchPublishedComparador: AsyncBoundaryMock = jest.fn()
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
  startRaioxRefresh: mockStartRaioxRefresh,
  readRaioxRefreshStatus: mockReadRaioxRefreshStatus,
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

jest.mock('../../src/services/clareza/core/corePublished.runtime', () => ({
  getPublishedRadar: jest.fn(),
  getPublishedCarteira: mockGetPublishedCarteira,
  getPublishedPortfolioAnalysis: jest.fn(),
  getPublishedRaiox: mockGetPublishedRaiox,
  searchPublishedRaiox: mockSearchPublishedRaiox,
  getPublishedComparador: mockGetPublishedComparador,
  searchPublishedComparador: mockSearchPublishedComparador,
  getPublishedEarnings: mockGetClarezaEarningsData,
  getPublishedTop10: mockGetClarezaTop10Json,
}))

const mockTestimonialAggregate: AsyncBoundaryMock = jest.fn()
const mockTestimonialCountDocuments: AsyncBoundaryMock = jest.fn()
const mockTestimonialFindOne: AsyncBoundaryMock = jest.fn()
const mockTestimonialFindById: AsyncBoundaryMock = jest.fn()
const mockTestimonialFindByIdAndDelete: AsyncBoundaryMock = jest.fn()
const mockTestimonialFind = jest.fn<Record<string, unknown>, unknown[]>()
const mockUserFind = jest.fn<Record<string, unknown>, unknown[]>()
const mockUserAggregate: AsyncBoundaryMock = jest.fn()
const mockUserFindById: AsyncBoundaryMock = jest.fn()
const mockTestimonialSave: AsyncBoundaryMock = jest.fn()
const mockTestimonialConstructor = Object.assign(
  jest.fn(() => ({ save: mockTestimonialSave })),
  {
    aggregate: mockTestimonialAggregate,
    countDocuments: mockTestimonialCountDocuments,
    find: mockTestimonialFind,
    findOne: mockTestimonialFindOne,
    findById: mockTestimonialFindById,
    findByIdAndDelete: mockTestimonialFindByIdAndDelete,
  },
)

jest.mock('../../src/models/Testimonial', () => ({
  Testimonial: mockTestimonialConstructor,
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    aggregate: mockUserAggregate,
    find: mockUserFind,
    findById: mockUserFindById,
  },
}))

jest.mock('../../src/models/Class', () => ({
  Class: { findOne: jest.fn() },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: { removeTag: jest.fn() },
}))

jest.mock('../../src/services/testimonials/testimonialTags.service', () => ({
  addTestimonialTagsToUser: jest.fn(),
  getTestimonialTags: jest.fn(),
  removeTestimonialTagsFromUser: jest.fn(),
  updateTestimonialTagsOnCompletion: jest.fn(),
}))

jest.mock('../../src/services/testimonials/controllerSupport', () => ({
  ensureTestimonialModel: () => mockTestimonialConstructor,
  errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
  errorStack: (error: unknown) => error instanceof Error ? error.stack : undefined,
  queryString: (value: unknown) => typeof value === 'string' ? value : undefined,
}))

import clarezaRouter from '../../src/routes/clareza.routes'
import testimonialsRouter from '../../src/routes/testimonials.routes'
import { deleteTestimonial } from '../../src/controllers/testimonials/testimonialCommands.controller'

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
  { name: 'read Raio-X query', method: 'get', path: '/raiox?symbol=AAPL', dependency: mockGetPublishedRaiox, code: 'CLAREZA_RAIOX_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'search Raio-X query', method: 'get', path: '/raiox?search=apple', dependency: mockSearchPublishedRaiox, code: 'CLAREZA_RAIOX_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'search Raio-X', method: 'get', path: '/raiox-search?q=apple', dependency: mockSearchRaiox, code: 'CLAREZA_RAIOX_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'diagnose Raio-X', method: 'get', path: '/raiox-diagnose', dependency: mockDiagnoseRaiox, code: 'CLAREZA_RAIOX_DIAGNOSE_FAILED', message: 'Erro interno do servidor' },
  { name: 'read Raio-X ticker', method: 'get', path: '/raiox/AAPL', dependency: mockGetPublishedRaiox, code: 'CLAREZA_RAIOX_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'read portfolio', method: 'get', path: '/carteira/data', dependency: mockGetPublishedCarteira, code: 'CLAREZA_CARTEIRA_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'search portfolio', method: 'get', path: '/carteira-search?q=apple', dependency: mockSearchCarteira, code: 'CLAREZA_CARTEIRA_SEARCH_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh portfolio', method: 'post', path: '/carteira/refresh', dependency: mockRefreshClarezaCarteiraData, code: 'CLAREZA_CARTEIRA_REFRESH_FAILED', message: 'Erro interno do servidor' },
  { name: 'read earnings', method: 'get', path: '/earnings/data', dependency: mockGetClarezaEarningsData, code: 'CLAREZA_EARNINGS_READ_FAILED', message: 'Erro interno do servidor' },
  { name: 'refresh earnings', method: 'post', path: '/earnings/refresh', dependency: mockRefreshClarezaEarningsData, code: 'CLAREZA_EARNINGS_REFRESH_FAILED', message: 'Erro interno do servidor' },
]

interface TestimonialOperation {
  name: string
  method: 'delete' | 'get' | 'post' | 'put'
  path: string
  arrange: (failure: unknown) => void
  code: string
  message: string
  body?: Record<string, unknown>
  omitBody?: boolean
}

const objectId = '507f1f77bcf86cd799439011'
const testimonialOperations: TestimonialOperation[] = [
  {
    name: 'read available students', method: 'get', path: '/available-students',
    arrange: (failure) => {
      mockUserFind.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }),
          }),
        }),
      })
    },
    code: 'TESTIMONIAL_AVAILABLE_STUDENTS_READ_FAILED', message: 'Erro ao buscar estudantes',
  },
  {
    name: 'read best candidates', method: 'get', path: '/best-candidates',
    arrange: (failure) => { mockUserAggregate.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_CANDIDATES_READ_FAILED', message: 'Erro interno do servidor',
  },
  {
    name: 'create testimonial', method: 'post', path: '/',
    arrange: (failure) => { mockTestimonialFindOne.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_CREATE_FAILED', message: 'Erro interno do servidor',
    body: { studentId: objectId, studentEmail: 'alice@example.test', studentName: 'Alice' },
  },
  {
    name: 'create testimonial request', method: 'post', path: '/request',
    arrange: () => undefined,
    code: 'TESTIMONIAL_REQUEST_CREATE_FAILED', message: 'Erro ao criar solicitações',
    omitBody: true,
  },
  {
    name: 'update testimonial', method: 'put', path: `/${objectId}`,
    arrange: (failure) => { mockTestimonialFindById.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_UPDATE_FAILED', message: 'Erro ao atualizar testemunho',
    body: { status: 'PENDING' },
  },
  {
    name: 'delete testimonial', method: 'delete', path: `/${objectId}`,
    arrange: (failure) => { mockTestimonialFindByIdAndDelete.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_DELETE_FAILED', message: 'Erro ao remover testemunho',
  },
  {
    name: 'read testimonial stats', method: 'get', path: '/stats',
    arrange: (failure) => { mockTestimonialAggregate.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas',
  },
  {
    name: 'list testimonials', method: 'get', path: '/',
    arrange: (failure) => { mockTestimonialAggregate.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_LIST_FAILED', message: 'Erro ao listar testemunhos',
  },
  {
    name: 'read testimonial report', method: 'get', path: '/report',
    arrange: (failure) => { mockTestimonialAggregate.mockRejectedValueOnce(failure) },
    code: 'TESTIMONIAL_REPORT_READ_FAILED', message: 'Erro ao gerar relatório',
  },
  {
    name: 'read student testimonials', method: 'get', path: `/student?studentId=${objectId}`,
    arrange: (failure) => {
      mockTestimonialFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }),
      })
    },
    code: 'TESTIMONIAL_STUDENT_READ_FAILED', message: 'Erro ao buscar testemunhos do estudante',
  },
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
      expect(clarezaOperations).toHaveLength(17)
      expect(new Set(clarezaOperations.map(({ code }) => code)).size).toBe(15)
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

    it('starts Raio-X refresh in background and exposes polling status', async () => {
      mockStartRaioxRefresh.mockResolvedValueOnce({
        status: 'running', startedAt: '2026-09-01T00:00:00.000Z', completedItems: 0,
        reused: false, resumed: false,
      })
      mockReadRaioxRefreshStatus
        .mockResolvedValueOnce({
          status: 'running', startedAt: '2026-09-01T00:00:00.000Z',
          completedItems: 0, resumed: false,
        })
        .mockResolvedValueOnce({
          status: 'succeeded', startedAt: '2026-09-01T00:00:00.000Z',
          finishedAt: '2026-09-01T00:01:00.000Z', completedItems: 185,
          result: { total: 185, errors: 0 },
        })
      const app = appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter })

      const started = await request(app).post('/raiox/refresh' + offline).send({})
      expect(started.status).toBe(202)
      expect(started.body).toMatchObject({
        success: true,
        data: { status: 'running', reused: false },
      })

      const running = await request(app).get('/raiox/refresh/status' + offline)
      expect(running.body).toMatchObject({ success: true, data: { status: 'running' } })

      const completed = await request(app).get('/raiox/refresh/status' + offline)
      expect(completed.body).toMatchObject({
        success: true,
        data: { status: 'succeeded', result: { total: 185, errors: 0 } },
      })
    })

    it('preserves the unavailable-data response', async () => {
      mockGetClarezaData.mockResolvedValueOnce(null)
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/data' + offline)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ error: 'Dados indisponíveis. Tente novamente em breve.' })
    })

    it.each([
      { name: 'Top 10', path: '/top10/refresh', dependency: mockRefreshClarezaTop10Data },
      { name: 'earnings', path: '/earnings/refresh', dependency: mockRefreshClarezaEarningsData },
    ])('preserves the FMP unavailable response for $name refresh', async ({ path, dependency }) => {
      dependency.mockRejectedValueOnce(new IntegrationUnavailableError('fmp', secret))
      const logError = jest.fn()
      const app = appForCentralError(
        { kind: 'router', mountPath: '/', router: clarezaRouter },
        'clareza-fmp-request',
        logError,
      )

      const response = await request(app).post(path + offline).send({})

      expect(response.status).toBe(503)
      expect(response.headers['x-request-id']).toBe('clareza-fmp-request')
      expect(response.body).toEqual({
        success: false,
        code: 'INTEGRATION_UNAVAILABLE',
        message: 'Serviço temporariamente indisponível',
        correlationId: 'clareza-fmp-request',
      })
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INTEGRATION_UNAVAILABLE',
        integration: 'fmp',
        status: 503,
      }))
      expect(JSON.stringify(logError.mock.calls)).not.toMatch(/alice@example\.test|token=hidden/)
    })
    it('preserves the intentional missing-symbol validation response', async () => {
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/raiox' + offline)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Parâmetro symbol ou search em falta.' })
    })

    it('preserves typed not-found handling without leaking through the central boundary', async () => {
      const { CoreRaioxAssetUnavailableError } = await import('../../src/services/clareza/core/coreRaioxComposition')
      mockGetPublishedRaiox.mockRejectedValueOnce(new CoreRaioxAssetUnavailableError())
      const response = await request(appForCentralError({ kind: 'router', mountPath: '/', router: clarezaRouter }))
        .get('/raiox/MISSING' + offline)

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'Ticker nao encontrado' })
    })
  })

  describe('Testimonials router', () => {
    it('covers the exact 10-site migration membership', () => {
      expect(testimonialOperations).toHaveLength(10)
      expect(new Set(testimonialOperations.map(({ code }) => code)).size).toBe(10)
    })

    it.each(testimonialOperations)('$name returns its stable redacted central envelope', async (operation) => {
      operation.arrange(secret)
      const app = appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter })
      const requestPath = `${operation.path}${operation.path.includes('?') ? '&' : '?'}${offline.slice(1)}`
      const pending = request(app)[operation.method](requestPath)
      const response = operation.omitBody || operation.method === 'get' || operation.method === 'delete'
        ? await pending
        : await pending.send(operation.body ?? {})

      expectCentralError(response, { code: operation.code, message: operation.message })
    })

    it('keeps the validated delete failure classified through the real router', async () => {
      mockTestimonialFindByIdAndDelete.mockRejectedValueOnce(secret)
      const logError = jest.fn()
      const app = appForCentralError(
        { kind: 'router', mountPath: '/', router: testimonialsRouter },
        'sec10-request',
        logError,
      )

      await request(app).delete(`/${objectId}${offline}`)

      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'TESTIMONIAL_DELETE_FAILED',
      }))
      expect(JSON.stringify(logError.mock.calls)).not.toMatch(/alice@example\.test|token=hidden/)
    })

    it('threads the validated delete failure to next', async () => {
      mockTestimonialFindByIdAndDelete.mockRejectedValueOnce(secret)
      const next = jest.fn()

      await Reflect.apply(deleteTestimonial, undefined, [
        { params: { id: objectId }, query: {}, body: {} },
        {},
        next,
      ])

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        code: 'TESTIMONIAL_DELETE_FAILED',
        publicMessage: 'Erro ao remover testemunho',
      }))
    })

    it('normalizes a non-Error rejection', async () => {
      testimonialOperations[1].arrange('secret alice@example.test token=hidden')
      const response = await request(
        appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter }),
      ).get('/best-candidates' + offline)

      expectCentralError(response, {
        code: 'TESTIMONIAL_CANDIDATES_READ_FAILED',
        message: 'Erro interno do servidor',
      })
    })

    it('preserves required-student validation', async () => {
      const response = await request(
        appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter }),
      ).post('/' + offline).send({})

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        success: false,
        message: 'Dados do estudante sÃ£o obrigatÃ³rios',
      })
    })

    it('preserves testimonial not-found handling', async () => {
      mockTestimonialFindById.mockResolvedValueOnce(null)
      const response = await request(
        appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter }),
      ).put(`/${objectId}${offline}`).send({ status: 'PENDING' })

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Testemunho nÃ£o encontrado' })
    })
  })
})
