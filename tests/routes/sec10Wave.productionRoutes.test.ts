import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express'
import request from 'supertest'
import type { AsyncRouteHandler } from '../../src/security/asyncRoute'
import { createErrorHandling, internalError } from '../../src/security/errorHandling'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { expectCentralError, type ExpectedCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const secret = new Error('secret alice@example.test token=hidden')
const mockProductsList = jest.fn()
const mockProductProfilesList = jest.fn()
const mockProductSalesList = jest.fn()
const mockGuruSnapshotsList = jest.fn()
const mockHotmartProductsList = jest.fn()
const mockAsyncRouteInvocations = jest.fn()
let mockProductProfileDeleteFailure: unknown
let mockGuruSnapshotDeleteFailure: unknown

const mockProductProfileDelete = jest.fn(
  (_input: unknown, _res: unknown, next: NextFunction) => {
    next(mockProductProfileDeleteFailure)
  },
)
const mockGuruSnapshotDelete = jest.fn(
  (_input: unknown, _res: unknown, next: NextFunction) => {
    next(mockGuruSnapshotDeleteFailure)
  },
)

function mockControllerModule(names: string[]) {
  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [name, jest.fn()])),
  }
}

jest.mock('../../src/security/asyncRoute', () => {
  const actual = jest.requireActual<typeof import('../../src/security/asyncRoute')>(
    '../../src/security/asyncRoute',
  )
  return {
    ...actual,
    asyncRoute: (handler: AsyncRouteHandler) => {
      const wrapped = actual.asyncRoute(handler)
      return (req: Request, res: Response, next: NextFunction) => {
        mockAsyncRouteInvocations(handler)
        return wrapped(req, res, next)
      }
    },
  }
})
jest.mock('../../src/controllers/products/product.controller', () => ({
  __esModule: true,
  getAllProducts: mockProductsList,
  getProductById: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  getProductStudents: jest.fn(),
  getProductAnalytics: jest.fn(),
}))
jest.mock('../../src/controllers/products/products.controller', () => mockControllerModule([
  'getProducts', 'getProductById', 'getEngagementStats', 'getProductUsers',
]))
jest.mock('../../src/controllers/products/productProfile.controller', () => ({
  __esModule: true,
  getAllProductProfiles: mockProductProfilesList,
  getProductProfileByCode: jest.fn(),
  getProductProfileStats: jest.fn(),
  createProductProfile: jest.fn(),
  duplicateProductProfile: jest.fn(),
  updateProductProfile: jest.fn(),
  deleteProductProfile: mockProductProfileDelete,
}))
jest.mock('../../src/controllers/products/productSalesStats.controller', () => ({
  __esModule: true,
  getAllProductSalesStats: mockProductSalesList,
  getProductSalesStatsByProduct: jest.fn(),
  getProductSalesByPeriod: jest.fn(),
  rebuildProductSalesStatsEndpoint: jest.fn(),
  compareProducts: jest.fn(),
}))
jest.mock('../../src/controllers/hotmart', () => ({
  __esModule: true,
  compareSyncMethods: jest.fn(),
  findHotmartUser: jest.fn(),
  getHotmartProductBySubdomain: jest.fn(),
  getHotmartProducts: mockHotmartProductsList,
  getHotmartProductUsers: jest.fn(),
  getHotmartStats: jest.fn(),
  syncHotmartUsers: jest.fn(),
  syncHotmartUsersUniversal: jest.fn(),
  syncProgressOnly: jest.fn(),
  syncProgressOnlyUniversal: jest.fn(),
}))
jest.mock('../../src/controllers/guru.snapshot.controller', () => ({
  __esModule: true,
  createSnapshot: jest.fn(),
  updateSnapshot: jest.fn(),
  listSnapshots: mockGuruSnapshotsList,
  getSnapshot: jest.fn(),
  deleteSnapshot: mockGuruSnapshotDelete,
  deleteAllSnapshots: jest.fn(),
  getChurnFromSnapshots: jest.fn(),
  createHistoricalSnapshots: jest.fn(),
}))
jest.mock('../../src/controllers/guru.webhook.controller', () => mockControllerModule([
  'handleGuruWebhook', 'listGuruWebhooks', 'listWebhooksGroupedByMonth',
  'getGuruStats', 'reprocessWebhook', 'debugToken', 'migrateWebhookSource',
]))
jest.mock('../../src/controllers/guru.sso.controller', () => mockControllerModule([
  'ssoMyOrders', 'getSubscriptionStatus', 'listSubscriptions', 'diagnosSubscription',
]))
jest.mock('../../src/controllers/guru.sync.controller', () => mockControllerModule([
  'syncAllFromGuru', 'syncEmailFromGuru', 'getSyncStats', 'previewSync', 'listUsersWithGuru',
]))
jest.mock('../../src/controllers/guru.analytics.controller', () => mockControllerModule([
  'getChurnMetrics', 'getChurnLive', 'getChurnLiveStatus', 'getMRRMetrics',
  'compareGuruVsClareza', 'fixMultiSubscriptions',
]))
jest.mock('../../src/controllers/guruInactivationRead.controller', () => mockControllerModule([
  'listPendingInactivation', 'getInactivationStats', 'listInactivated',
]))
jest.mock('../../src/controllers/guruInactivationMutation.controller', () => mockControllerModule([
  'revertInactivationMark', 'fixUsersToActive', 'quarantineUser',
  'cleanupDuplicateUserProducts', 'restoreUserProducts', 'markStaleInactive',
]))
jest.mock('../../src/controllers/guruInactivationExternal.controller', () => mockControllerModule([
  'inactivateSingle', 'inactivateBulk',
]))
jest.mock('../../src/controllers/guruInactivationMaintenance.controller', () => mockControllerModule([
  'cleanupInactivationList', 'diagnoseUsers',
]))
jest.mock('../../src/controllers/guruDiscrepancy.controller', () => mockControllerModule([
  'markDiscrepanciesForInactivation',
]))
jest.mock('../../src/controllers/guru.trials.controller', () => mockControllerModule([
  'getTrials', 'getTrialsStats', 'checkExpired', 'syncTrials', 'revertTrialMark', 'inactivateTrial',
]))

import guruRouter from '../../src/routes/guru.routes'
import hotmartRouter from '../../src/routes/hotmart.routes'
import productProfileRouter from '../../src/routes/productProfile.routes'
import productSalesStatsRouter from '../../src/routes/productSalesStats.routes'
import productsRouter from '../../src/routes/products.routes'

type ProductionRouteCase = {
  name: string
  method: 'delete' | 'get'
  mountPath: string
  path: string
  router: Router
  arrange: () => unknown
  expected: ExpectedCentralError
}

const asyncRouteCases: ProductionRouteCase[] = [
  {
    name: 'Products',
    method: 'get',
    mountPath: '/api/products',
    path: '/api/products',
    router: productsRouter,
    arrange: () => {
      const failure = internalError('Erro ao buscar produtos', 'PRODUCT_LIST_FAILED', secret)
      mockProductsList.mockRejectedValueOnce(failure)
      return failure
    },
    expected: { code: 'PRODUCT_LIST_FAILED', message: 'Erro ao buscar produtos' },
  },
  {
    name: 'Product Profile',
    method: 'get',
    mountPath: '/api/product-profiles',
    path: '/api/product-profiles',
    router: productProfileRouter,
    arrange: () => {
      const failure = internalError(
        'Erro ao buscar perfis de produto',
        'PRODUCT_PROFILE_LIST_FAILED',
        secret,
      )
      mockProductProfilesList.mockRejectedValueOnce(failure)
      return failure
    },
    expected: { code: 'PRODUCT_PROFILE_LIST_FAILED', message: 'Erro ao buscar perfis de produto' },
  },
  {
    name: 'Product Sales',
    method: 'get',
    mountPath: '/api/analytics/product-sales',
    path: '/api/analytics/product-sales',
    router: productSalesStatsRouter,
    arrange: () => {
      const failure = internalError(
        'Erro ao buscar estatísticas',
        'PRODUCT_SALES_STATS_LIST_FAILED',
        secret,
      )
      mockProductSalesList.mockRejectedValueOnce(failure)
      return failure
    },
    expected: { code: 'PRODUCT_SALES_STATS_LIST_FAILED', message: 'Erro ao buscar estatísticas' },
  },
  {
    name: 'Guru',
    method: 'get',
    mountPath: '/api/guru',
    path: '/api/guru/snapshots',
    router: guruRouter,
    arrange: () => {
      const failure = internalError('Erro ao listar snapshots', 'GURU_SNAPSHOT_LIST_FAILED', secret)
      mockGuruSnapshotsList.mockRejectedValueOnce(failure)
      return failure
    },
    expected: { code: 'GURU_SNAPSHOT_LIST_FAILED', message: 'Erro ao listar snapshots' },
  },
  {
    name: 'Hotmart',
    method: 'get',
    mountPath: '/api/hotmart',
    path: '/api/hotmart/v2/products',
    router: hotmartRouter,
    arrange: () => {
      const failure = internalError(
        'Erro ao buscar produtos Hotmart',
        'HOTMART_PRODUCT_LIST_FAILED',
        secret,
      )
      mockHotmartProductsList.mockRejectedValueOnce(failure)
      return failure
    },
    expected: { code: 'HOTMART_PRODUCT_LIST_FAILED', message: 'Erro ao buscar produtos Hotmart' },
  },
]

const validatedDeleteCases: ProductionRouteCase[] = [
  {
    name: 'Product Profile',
    method: 'delete',
    mountPath: '/api/product-profiles',
    path: '/api/product-profiles/P1?hardDelete=false',
    router: productProfileRouter,
    arrange: () => {
      mockProductProfileDeleteFailure = internalError(
        'Erro ao deletar perfil de produto',
        'PRODUCT_PROFILE_DELETE_FAILED',
        secret,
      )
      return mockProductProfileDeleteFailure
    },
    expected: { code: 'PRODUCT_PROFILE_DELETE_FAILED', message: 'Erro ao deletar perfil de produto' },
  },
  {
    name: 'Guru',
    method: 'delete',
    mountPath: '/api/guru',
    path: '/api/guru/snapshots/2026/1',
    router: guruRouter,
    arrange: () => {
      mockGuruSnapshotDeleteFailure = internalError(
        'Erro ao apagar snapshot',
        'GURU_SNAPSHOT_DELETE_FAILED',
        secret,
      )
      return mockGuruSnapshotDeleteFailure
    },
    expected: { code: 'GURU_SNAPSHOT_DELETE_FAILED', message: 'Erro ao apagar snapshot' },
  },
]

function buildApp(route: ProductionRouteCase, next: jest.Mock<void, [unknown]>) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'sec10-request',
    logError: () => undefined,
  })
  const observeDelegation: ErrorRequestHandler = (error, _req, _res, delegate) => {
    next(error)
    delegate(error)
  }

  app.use(express.json())
  app.use(errors.correlationId)
  app.use(route.mountPath, route.router)
  app.use(observeDelegation)
  app.use(errors.handler)
  return app
}

async function callRoute(
  route: ProductionRouteCase,
  next: jest.Mock<void, [unknown]>,
): Promise<request.Response> {
  const app = buildApp(route, next)
  const separator = route.path.includes('?') ? '&' : '?'
  const path = `${route.path}${separator}__bo2_offline_loopback=1`
  return route.method === 'delete' ? request(app).delete(path) : request(app).get(path)
}

beforeEach(() => {
  jest.clearAllMocks()
})

test.each(asyncRouteCases)(
  '$name real router catches one rejected controller promise through asyncRoute',
  async (route) => {
    const next = jest.fn<void, [unknown]>()
    const failure = route.arrange()
    const response = await callRoute(route, next)

    expect(mockAsyncRouteInvocations).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith(failure)
    expectCentralError(response, route.expected)
  },
)

test.each(validatedDeleteCases)(
  '$name real validated delete passes next and delegates exactly once',
  async (route) => {
    const next = jest.fn<void, [unknown]>()
    const failure = route.arrange()
    const response = await callRoute(route, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith(failure)
    expectCentralError(response, route.expected)
  },
)
