import express from 'express'
import type { RequestHandler } from 'express'
import request from 'supertest'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import canonicalLogger from '../../src/utils/logger'
import { SyncLogger } from '../../src/controllers/syncUtilizadoresControllers/curseduca/support'

jest.mock('../../src/utils/logger', () => {
  const actual = jest.requireActual<typeof import('../../src/utils/logger')>('../../src/utils/logger')
  return {
    __esModule: true,
    ...actual,
    default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  }
})

installTestRuntimeConfigHooks()

type AsyncMock = jest.Mock<Promise<unknown>, unknown[]>
type ValueMock = jest.Mock<unknown, unknown[]>

const mockSchedulerGetAllJobs: AsyncMock = jest.fn()
const mockSchedulerGetActiveJobs: AsyncMock = jest.fn()
const mockSchedulerGetJobsByType: AsyncMock = jest.fn()
const mockSchedulerGetJobById: AsyncMock = jest.fn()
const mockSchedulerCreateJob: AsyncMock = jest.fn()
const mockSchedulerUpdateJob: AsyncMock = jest.fn()
const mockSchedulerDeleteJob: AsyncMock = jest.fn()
const mockSchedulerToggleJob: AsyncMock = jest.fn()
const mockSchedulerExecuteJobManually: AsyncMock = jest.fn()
const mockSchedulerGetNextExecutions: ValueMock = jest.fn()
const mockCronExecutionFind: ValueMock = jest.fn()
const mockCronConfigFind: ValueMock = jest.fn()
const mockProductFind: ValueMock = jest.fn()
const mockProductFindOne: ValueMock = jest.fn()
const mockUserFind: ValueMock = jest.fn()
const mockUserFindByIdAndUpdate: AsyncMock = jest.fn()
const mockUserCountDocuments: AsyncMock = jest.fn()
const mockUserProductFind: ValueMock = jest.fn()
const mockUserProductCountDocuments: AsyncMock = jest.fn()
const mockSyncHistoryFind: ValueMock = jest.fn()
const mockSyncHistoryFindById: ValueMock = jest.fn()
const mockGetUserCountForProduct: AsyncMock = jest.fn()
const mockGetUsersByProduct: AsyncMock = jest.fn()
const mockGetOptionalCurseducaRuntimeSettings: ValueMock = jest.fn()
const mockFetchCurseducaDataForSync: AsyncMock = jest.fn()
const mockExecuteUniversalSync: AsyncMock = jest.fn()
const mockExecuteTagRulesOnly: AsyncMock = jest.fn()
const mockGetReports: AsyncMock = jest.fn()
const mockGetReportById: AsyncMock = jest.fn()
const mockGetAggregatedStats: AsyncMock = jest.fn()
const mockGetMonthlyStats: AsyncMock = jest.fn()
const mockRunCrossReference: AsyncMock = jest.fn()
const mockClearUnifiedCache: ValueMock = jest.fn()
const mockBuildDashboardStats: AsyncMock = jest.fn()

jest.mock('../../src/services/cron/scheduler', () => ({
  __esModule: true,
  default: {
    getAllJobs: mockSchedulerGetAllJobs,
    getActiveJobs: mockSchedulerGetActiveJobs,
    getJobsByType: mockSchedulerGetJobsByType,
    getJobById: mockSchedulerGetJobById,
    createJob: mockSchedulerCreateJob,
    updateJob: mockSchedulerUpdateJob,
    deleteJob: mockSchedulerDeleteJob,
    toggleJob: mockSchedulerToggleJob,
    executeJobManually: mockSchedulerExecuteJobManually,
    getNextExecutions: mockSchedulerGetNextExecutions,
  },
}))

jest.mock('../../src/models', () => ({
  CronExecution: { find: mockCronExecutionFind },
  SyncHistory: { find: mockSyncHistoryFind },
  TagRule: { find: jest.fn() },
  UserProduct: {
    find: mockUserProductFind,
    countDocuments: mockUserProductCountDocuments,
  },
}))

jest.mock('../../src/models/cron/CronConfig', () => ({
  __esModule: true,
  default: { find: mockCronConfigFind },
}))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    find: mockProductFind,
    findOne: mockProductFindOne,
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
    countDocuments: mockUserCountDocuments,
  },
}))

jest.mock('../../src/models/SyncModels/SyncHistory', () => ({
  __esModule: true,
  default: { findById: mockSyncHistoryFindById },
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUserCountForProduct: mockGetUserCountForProduct,
  getUsersByProduct: mockGetUsersByProduct,
}))

jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getOptionalCurseducaRuntimeSettings: mockGetOptionalCurseducaRuntimeSettings,
  isDevelopmentRuntime: jest.fn(() => false),
}))

jest.mock('../../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter', () => ({
  __esModule: true,
  default: { fetchCurseducaDataForSync: mockFetchCurseducaDataForSync },
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: mockExecuteUniversalSync },
}))

jest.mock('../../src/services/cron/dailyPipeline.service', () => ({
  executeTagRulesOnly: mockExecuteTagRulesOnly,
}))

jest.mock('../../src/services/syncUtilizadoresServices/syncReports.service', () => ({
  __esModule: true,
  default: {
    getReports: mockGetReports,
    getReportById: mockGetReportById,
    getAggregatedStats: mockGetAggregatedStats,
  },
}))

jest.mock('../../src/services/syncUtilizadoresServices/activitySnapshot.service', () => ({
  __esModule: true,
  default: { getMonthlyStats: mockGetMonthlyStats },
}))

jest.mock('../../src/services/guru/crossReference.service', () => ({
  runCrossReferenceAfterCurseducaSync: mockRunCrossReference,
}))

jest.mock('../../src/services/syncUtilizadoresServices/dualReadService', () => ({
  clearUnifiedCache: mockClearUnifiedCache,
}))

jest.mock('../../src/services/dashboardStatsBuilder.service', () => ({
  buildDashboardStats: mockBuildDashboardStats,
}))

import cronRouter from '../../src/routes/syncUtilizadoresRoutes/cron.routes'
import curseducaRouter from '../../src/routes/curseduca.routes'
import syncReportsRouter from '../../src/routes/syncUtilizadoresRoutes/syncReports.routes'
import syncStatsRouter from '../../src/routes/syncUtilizadoresRoutes/syncStats.routes'
import { validateCronExpression } from '../../src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller'

const secret = new Error('secret alice@example.test token=hidden')
const objectId = '507f1f77bcf86cd799439011'

type HttpMethod = 'delete' | 'get' | 'post' | 'put'

interface ErrorRouteCase {
  name: string
  router: express.Router
  mountPath: string
  method: HttpMethod
  path: string
  body?: Record<string, unknown>
  arrange: () => void
  expected: { code: string; message: string }
}

function rejectOnce(mock: AsyncMock): void {
  mock.mockRejectedValueOnce(secret)
}

function rejectValueOnce(mock: ValueMock): void {
  mock.mockImplementationOnce(() => Promise.reject(secret))
}

function rejectingChain(...methods: string[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of methods) {
    chain[method] = method === methods.at(-1)
      ? jest.fn(() => Promise.reject(secret))
      : jest.fn(() => chain)
  }
  return chain
}

function resolvingChain(value: unknown, ...methods: string[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of methods) {
    chain[method] = method === methods.at(-1)
      ? jest.fn(() => Promise.resolve(value))
      : jest.fn(() => chain)
  }
  return chain
}

const cases: ErrorRouteCase[] = [
  {
    name: 'cron job list', router: cronRouter, mountPath: '/api/cron', method: 'get', path: '/api/cron/jobs',
    arrange: () => rejectOnce(mockSchedulerGetAllJobs),
    expected: { code: 'CRON_JOB_LIST_FAILED', message: 'Erro ao buscar jobs' },
  },
  {
    name: 'cron job read', router: cronRouter, mountPath: '/api/cron', method: 'get', path: `/api/cron/jobs/${objectId}`,
    arrange: () => rejectOnce(mockSchedulerGetJobById),
    expected: { code: 'CRON_JOB_READ_FAILED', message: 'Erro ao buscar job' },
  },
  {
    name: 'cron job create', router: cronRouter, mountPath: '/api/cron', method: 'post', path: '/api/cron/jobs',
    body: { name: 'offline', syncType: 'curseduca', cronExpression: '0 0 * * *' },
    arrange: () => rejectOnce(mockSchedulerCreateJob),
    expected: { code: 'CRON_JOB_CREATE_FAILED', message: 'Erro ao criar job' },
  },
  {
    name: 'cron job update', router: cronRouter, mountPath: '/api/cron', method: 'put', path: `/api/cron/jobs/${objectId}`,
    body: { description: 'offline' }, arrange: () => rejectOnce(mockSchedulerUpdateJob),
    expected: { code: 'CRON_JOB_UPDATE_FAILED', message: 'Erro ao atualizar job' },
  },
  {
    name: 'cron job delete', router: cronRouter, mountPath: '/api/cron', method: 'delete', path: `/api/cron/jobs/${objectId}`,
    arrange: () => rejectOnce(mockSchedulerDeleteJob),
    expected: { code: 'CRON_JOB_DELETE_FAILED', message: 'Erro ao deletar job' },
  },
  {
    name: 'cron job toggle', router: cronRouter, mountPath: '/api/cron', method: 'post', path: `/api/cron/jobs/${objectId}/toggle`,
    body: { enabled: true }, arrange: () => rejectOnce(mockSchedulerToggleJob),
    expected: { code: 'CRON_JOB_TOGGLE_FAILED', message: 'Erro ao toggle job' },
  },
  {
    name: 'cron manual trigger', router: cronRouter, mountPath: '/api/cron', method: 'post', path: `/api/cron/jobs/${objectId}/trigger`,
    arrange: () => rejectOnce(mockSchedulerExecuteJobManually),
    expected: { code: 'CRON_JOB_TRIGGER_FAILED', message: 'Erro ao executar job' },
  },
  {
    name: 'cron job history', router: cronRouter, mountPath: '/api/cron', method: 'get', path: `/api/cron/jobs/${objectId}/history`,
    arrange: () => rejectOnce(mockSchedulerGetJobById),
    expected: { code: 'CRON_JOB_HISTORY_FAILED', message: 'Erro ao buscar histórico' },
  },
  {
    name: 'cron scheduler status', router: cronRouter, mountPath: '/api/cron', method: 'get', path: '/api/cron/status',
    arrange: () => rejectOnce(mockSchedulerGetActiveJobs),
    expected: { code: 'CRON_SCHEDULER_STATUS_FAILED', message: 'Erro ao buscar status' },
  },
  {
    name: 'cron tag rules trigger', router: cronRouter, mountPath: '/api/cron', method: 'post', path: '/api/cron/tag-rules-only',
    arrange: () => rejectOnce(mockExecuteTagRulesOnly),
    expected: { code: 'CRON_TAG_RULES_TRIGGER_FAILED', message: 'Erro ao executar Tag Rules Only' },
  },
  {
    name: 'CursEduca dashboard', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/dashboard',
    arrange: () => rejectValueOnce(mockProductFind),
    expected: { code: 'CURSEDUCA_DASHBOARD_FAILED', message: 'Erro ao carregar dashboard CursEduca' },
  },
  {
    name: 'CursEduca product list', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/v2/products',
    arrange: () => mockProductFind.mockReturnValueOnce(rejectingChain('select', 'lean')),
    expected: { code: 'CURSEDUCA_PRODUCT_LIST_FAILED', message: 'Erro ao buscar produtos CursEduca' },
  },
  {
    name: 'CursEduca product read', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/v2/products/group-1',
    arrange: () => mockProductFindOne.mockReturnValueOnce(rejectingChain('lean')),
    expected: { code: 'CURSEDUCA_PRODUCT_READ_FAILED', message: 'Erro ao buscar produto CursEduca' },
  },
  {
    name: 'CursEduca product users', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/v2/products/group-1/users',
    arrange: () => rejectValueOnce(mockProductFindOne),
    expected: { code: 'CURSEDUCA_PRODUCT_USERS_READ_FAILED', message: 'Erro ao buscar utilizadores do produto CursEduca' },
  },
  {
    name: 'CursEduca product stats', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/v2/stats',
    arrange: () => mockProductFind.mockReturnValueOnce(rejectingChain('lean')),
    expected: { code: 'CURSEDUCA_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas CursEduca' },
  },
  {
    name: 'CursEduca manual sync', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/sync/universal',
    arrange: () => {
      mockGetOptionalCurseducaRuntimeSettings.mockReturnValueOnce({ apiUrl: 'offline', accessToken: 'offline', apiKey: 'offline' })
      rejectOnce(mockFetchCurseducaDataForSync)
    },
    expected: { code: 'CURSEDUCA_SYNC_FAILED', message: 'Erro ao executar sincronização CursEduca' },
  },
  {
    name: 'CursEduca users with classes', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/users-with-classes',
    arrange: () => mockUserFind.mockReturnValueOnce(rejectingChain('select', 'lean')),
    expected: { code: 'CURSEDUCA_USERS_READ_FAILED', message: 'Erro ao buscar utilizadores CursEduca' },
  },
  {
    name: 'CursEduca user classes update', router: curseducaRouter, mountPath: '/api/curseduca', method: 'put', path: `/api/curseduca/user/${objectId}/classes`,
    body: { enrolledClasses: ['class-1'] }, arrange: () => rejectOnce(mockUserFindByIdAndUpdate),
    expected: { code: 'CURSEDUCA_USER_CLASSES_UPDATE_FAILED', message: 'Erro ao atualizar turmas CursEduca' },
  },
  {
    name: 'CursEduca sync comparison', router: curseducaRouter, mountPath: '/api/curseduca', method: 'get', path: '/api/curseduca/sync/compare',
    arrange: () => mockSyncHistoryFind.mockReturnValueOnce(rejectingChain('sort', 'limit', 'select', 'lean')),
    expected: { code: 'CURSEDUCA_SYNC_COMPARISON_FAILED', message: 'Erro ao comparar sincronizações CursEduca' },
  },
  {
    name: 'sync report list', router: syncReportsRouter, mountPath: '/api/sync/reports', method: 'get', path: '/api/sync/reports',
    arrange: () => rejectOnce(mockGetReports),
    expected: { code: 'SYNC_REPORT_LIST_FAILED', message: 'Erro ao buscar reports' },
  },
  {
    name: 'sync report read', router: syncReportsRouter, mountPath: '/api/sync/reports', method: 'get', path: `/api/sync/reports/${objectId}`,
    arrange: () => rejectOnce(mockGetReportById),
    expected: { code: 'SYNC_REPORT_READ_FAILED', message: 'Erro ao buscar report' },
  },
  {
    name: 'sync report stats', router: syncReportsRouter, mountPath: '/api/sync/reports', method: 'get', path: '/api/sync/reports/stats',
    arrange: () => rejectOnce(mockGetAggregatedStats),
    expected: { code: 'SYNC_REPORT_STATS_FAILED', message: 'Erro ao buscar stats agregados' },
  },
  {
    name: 'sync history read', router: syncStatsRouter, mountPath: '/api/sync', method: 'get', path: `/api/sync/history/${objectId}`,
    arrange: () => mockSyncHistoryFindById.mockReturnValueOnce(rejectingChain('populate', 'lean')),
    expected: { code: 'SYNC_HISTORY_READ_FAILED', message: 'Erro ao buscar sync' },
  },
  {
    name: 'sync snapshot stats', router: syncStatsRouter, mountPath: '/api/sync', method: 'get', path: '/api/sync/snapshots/stats',
    arrange: () => rejectOnce(mockGetMonthlyStats),
    expected: { code: 'SYNC_SNAPSHOT_STATS_FAILED', message: 'Erro ao buscar estatísticas' },
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockCronConfigFind.mockReturnValue(resolvingChain([], 'lean'))
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(SyncLogger.prototype, 'error')
  global.__curseducaSyncRunning = false
  global.__curseducaSyncStartedAt = undefined
  global.__curseducaSyncFinishedAt = null
  global.__curseducaSyncResult = null
  global.__curseducaSyncError = null
})

afterEach(() => {
  jest.restoreAllMocks()
})

test.each(cases)('$name uses the central redacted error contract', async (route) => {
  route.arrange()
  const centralLogger = jest.fn()
  const app = appForCentralError(
    { kind: 'router', mountPath: route.mountPath, router: route.router },
    'sec10-request',
    centralLogger,
  )
  const pending = request(app)[route.method](route.path).query({ __bo2_offline_loopback: '1' })
  const response = route.body ? await pending.send(route.body) : await pending

  expectCentralError(response, route.expected)
  expect(console.error).not.toHaveBeenCalled()
  expect(SyncLogger.prototype.error).not.toHaveBeenCalled()
  expect(centralLogger).toHaveBeenCalledTimes(1)
  expect(centralLogger).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'sec10-request' }))
  expect(JSON.stringify(centralLogger.mock.calls)).not.toMatch(/alice@example\.test|token=hidden/)
})

test('cron expression infrastructure failure uses the central redacted error contract', async () => {
  const cronValidationHandler: RequestHandler = validateCronExpression
  const throwingBody: RequestHandler = (req, res, next) => {
    Object.defineProperty(req, 'body', { get: () => { throw secret } })
    return cronValidationHandler(req, res, next)
  }
  const response = await request(appForCentralError({ kind: 'handler', handler: throwingBody, method: 'post' }))
    .post('/target')
    .query({ __bo2_offline_loopback: '1' })

  expectCentralError(response, {
    code: 'CRON_EXPRESSION_VALIDATION_FAILED',
    message: 'Erro ao validar cron expression',
  })
})

test('cron history preserves manual and scheduled distinctions with error counters', async () => {
  mockSchedulerGetJobById.mockResolvedValueOnce({
    _id: objectId,
    name: 'offline-job',
    totalRuns: 2,
    successfulRuns: 1,
    failedRuns: 1,
    getSuccessRate: () => 50,
  })
  mockCronExecutionFind.mockReturnValueOnce(resolvingChain([
    {
      _id: 'manual-error',
      status: 'error',
      startTime: new Date('2026-08-10T10:00:00.000Z'),
      endTime: new Date('2026-08-10T10:00:02.000Z'),
      duration: 2_000,
      studentsProcessed: 7,
      executionType: 'manual',
      errorMessage: 'offline failure',
    },
    {
      _id: 'scheduled-success',
      status: 'completed',
      startTime: new Date('2026-08-10T11:00:00.000Z'),
      endTime: new Date('2026-08-10T11:00:03.000Z'),
      duration: 3_000,
      studentsProcessed: 9,
      executionType: 'scheduled',
    },
  ], 'sort', 'limit', 'lean'))

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/cron',
    router: cronRouter,
  })).get(`/api/cron/jobs/${objectId}/history`).query({ limit: '2', __bo2_offline_loopback: '1' })

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({
    totalRuns: 2,
    successfulRuns: 1,
    failedRuns: 1,
    successRate: 50,
    count: 2,
    limit: 2,
    executions: [
      {
        _id: 'manual-error',
        triggeredBy: 'MANUAL',
        duration: 2,
        stats: { total: 7, updated: 7, errors: 1 },
      },
      {
        _id: 'scheduled-success',
        triggeredBy: 'CRON',
        duration: 3,
        stats: { total: 9, updated: 9, errors: 0 },
      },
    ],
  })
})

test('cron history preserves legacy coercion for a repeated limit query', async () => {
  mockSchedulerGetJobById.mockResolvedValueOnce({
    _id: objectId,
    name: 'offline-job',
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    getSuccessRate: () => 0,
  })
  mockCronExecutionFind.mockReturnValueOnce(resolvingChain([], 'sort', 'limit', 'lean'))

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/cron',
    router: cronRouter,
  })).get(`/api/cron/jobs/${objectId}/history`).query({
    limit: ['2', '9'],
    __bo2_offline_loopback: '1',
  })

  expect(response.status).toBe(200)
  expect(response.body.data.limit).toBe(2)
})

test.each([
  { label: 'invalid', syncType: 'unsupported' },
  { label: 'repeated', syncType: ['hotmart', 'curseduca'] },
])('cron jobs preserve the legacy $label syncType filter boundary', async ({ label, syncType }) => {
  const jobs = [{ _id: `filtered-${label}` }]
  mockSchedulerGetJobsByType.mockResolvedValueOnce(jobs)
  mockSchedulerGetAllJobs.mockResolvedValueOnce([{ _id: 'unfiltered' }])

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/cron',
    router: cronRouter,
  })).get('/api/cron/jobs').query({ syncType, __bo2_offline_loopback: '1' })

  expect(response.status).toBe(200)
  expect(response.body.data).toEqual({ total: 1, jobs, systemJobs: [] })
  expect(mockSchedulerGetJobsByType).toHaveBeenCalledWith(syncType)
})

test.each([
  {
    label: 'invalid sync type',
    query: { syncType: 'unsupported' },
    expectedLimit: 20,
    expectedSyncType: 'unsupported',
  },
  {
    label: 'repeated limit and sync type',
    query: { limit: ['4', '9'], syncType: ['hotmart', 'curseduca'] },
    expectedLimit: 4,
    expectedSyncType: ['hotmart', 'curseduca'],
  },
])('sync reports preserve legacy forwarding for $label', async ({ query, expectedLimit, expectedSyncType }) => {
  mockGetReports.mockResolvedValueOnce([])

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/sync/reports',
    router: syncReportsRouter,
  })).get('/api/sync/reports').query({ ...query, __bo2_offline_loopback: '1' })

  expect(response.status).toBe(200)
  expect(mockGetReports).toHaveBeenCalledWith(expectedLimit, expectedSyncType)
})

test('sync report stats preserve legacy coercion for repeated days', async () => {
  mockGetAggregatedStats.mockResolvedValueOnce({ totalSyncs: 0 })

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/sync/reports',
    router: syncReportsRouter,
  })).get('/api/sync/reports/stats').query({
    days: ['7', '30'],
    __bo2_offline_loopback: '1',
  })

  expect(response.status).toBe(200)
  expect(mockGetAggregatedStats).toHaveBeenCalledWith(7)
})

test.each([
  { label: 'invalid', platform: 'BROKEN' },
  { label: 'repeated', platform: ['HOTMART', 'DISCORD'] },
])('snapshot stats preserve the legacy $label platform boundary', async ({ platform }) => {
  mockGetMonthlyStats.mockResolvedValueOnce({ totalSnapshots: 0 })

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/sync',
    router: syncStatsRouter,
  })).get('/api/sync/snapshots/stats').query({ platform, __bo2_offline_loopback: '1' })

  expect(response.status).toBe(200)
  expect(response.body.data.platform).toEqual(platform)
  expect(mockGetMonthlyStats).toHaveBeenCalledWith(expect.any(Date), platform)
})

test('snapshot stats preserves the legacy invalid date from a repeated month query', async () => {
  mockGetMonthlyStats.mockResolvedValueOnce({ totalSnapshots: 0 })

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/sync',
    router: syncStatsRouter,
  })).get('/api/sync/snapshots/stats').query({
    month: ['2026-03', '2026-04'],
    __bo2_offline_loopback: '1',
  })

  expectCentralError(response, {
    code: 'SYNC_SNAPSHOT_STATS_FAILED',
    message: 'Erro ao buscar estatísticas',
  })
  const targetMonth = mockGetMonthlyStats.mock.calls[0]?.[0]
  if (!(targetMonth instanceof Date)) throw new Error('Expected the snapshot month boundary to receive a Date')
  expect(Number.isNaN(targetMonth.getTime())).toBe(true)
})
test('CursEduca product envelopes preserve product and membership cardinality', async () => {
  const products = [
    { _id: 'product-1', name: 'One', curseducaGroupId: 'group-1' },
    { _id: 'product-2', name: 'Two', curseducaGroupId: 'group-2' },
  ]
  const productOneUsers = [
    { products: [{ product: { _id: 'product-1' }, progress: { percentage: 80 } }] },
    { products: [{ product: { _id: 'product-1' }, progress: { percentage: 40 } }] },
  ]
  const productTwoUsers = [
    { products: [{ product: { _id: 'product-2' }, progress: { percentage: 70 } }] },
  ]
  const app = appForCentralError({
    kind: 'router',
    mountPath: '/api/curseduca',
    router: curseducaRouter,
  })

  mockProductFind.mockReturnValueOnce(resolvingChain(products, 'select', 'lean'))
  const listResponse = await request(app).get('/api/curseduca/v2/products').query({ __bo2_offline_loopback: '1' })

  expect(listResponse.status).toBe(200)
  expect(listResponse.body).toMatchObject({ count: 2, data: products })

  mockProductFindOne.mockImplementationOnce(() => Promise.resolve(products[0]))
  mockGetUsersByProduct.mockResolvedValueOnce(productOneUsers)
  const usersResponse = await request(app).get('/api/curseduca/v2/products/group-1/users').query({ __bo2_offline_loopback: '1' })

  expect(usersResponse.status).toBe(200)
  expect(usersResponse.body).toMatchObject({ count: 2, data: productOneUsers })

  mockProductFind.mockReturnValueOnce(resolvingChain(products, 'lean'))
  mockGetUsersByProduct
    .mockResolvedValueOnce(productOneUsers)
    .mockResolvedValueOnce(productTwoUsers)
  const statsResponse = await request(app).get('/api/curseduca/v2/stats').query({ __bo2_offline_loopback: '1' })

  expect(statsResponse.status).toBe(200)
  expect(statsResponse.body.summary).toEqual({
    totalProducts: 2,
    totalUsers: 3,
    overallAvgProgress: 65,
  })
})

test('CursEduca manual sync preserves its envelope when cross-reference fails safely', async () => {
  const sourceData = [{ email: 'member@example.test', curseducaUserId: 'member-1' }]
  const products = [{ _id: 'product-1', code: 'P1', name: 'One' }]
  mockGetOptionalCurseducaRuntimeSettings.mockReturnValueOnce({
    apiUrl: 'offline',
    accessToken: 'offline',
    apiKey: 'offline',
  })
  mockFetchCurseducaDataForSync.mockResolvedValueOnce(sourceData)
  mockExecuteUniversalSync.mockResolvedValueOnce({
    success: false,
    reportId: 'report-finalized',
    syncHistoryId: 'history-finalized',
    duration: 12,
    stats: { total: 1, inserted: 0, updated: 1, unchanged: 0, errors: 2 },
    errors: [{ message: 'one' }, { message: 'two' }],
    warnings: [{ message: 'warning' }],
  })
  mockProductFind.mockReturnValueOnce(resolvingChain(products, 'select'))
  mockUserProductFind.mockReturnValueOnce(resolvingChain([], 'populate'))
  mockUserProductCountDocuments.mockResolvedValue(0)
  mockUserCountDocuments.mockResolvedValueOnce(0)
  mockRunCrossReference.mockRejectedValueOnce(secret)
  mockBuildDashboardStats.mockResolvedValueOnce(undefined)

  const centralLogger = jest.fn()
  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/curseduca',
    router: curseducaRouter,
  }, 'sec10-request', centralLogger)).get('/api/curseduca/sync/universal').query({ __bo2_offline_loopback: '1' })

  expect(centralLogger).not.toHaveBeenCalled()
  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({
    success: false,
    data: {
      reportId: 'report-finalized',
      syncHistoryId: 'history-finalized',
      errorsCount: 2,
      warningsCount: 1,
      reportUrl: '/api/sync/reports/report-finalized',
      syncHistoryUrl: '/api/sync/history/history-finalized',
    },
    _universalSync: true,
    _version: '3.1',
  })
  expect(mockExecuteUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
    syncType: 'curseduca',
    triggeredBy: 'MANUAL',
    sourceData,
  }))
  expect(canonicalLogger.warn).toHaveBeenCalledTimes(1)
  expect(canonicalLogger.warn).toHaveBeenCalledWith(
    'Cross-reference CursEduca falhou; sincronização continua',
    { stage: 'cross-reference', status: 'ignored' },
  )
})

test('CursEduca credential kill switch returns before the adapter runs', async () => {
  mockGetOptionalCurseducaRuntimeSettings.mockReturnValueOnce(undefined)

  const response = await request(appForCentralError({
    kind: 'router',
    mountPath: '/api/curseduca',
    router: curseducaRouter,
  })).get('/api/curseduca/sync/universal').query({ __bo2_offline_loopback: '1' })

  expect(response.status).toBe(400)
  expect(response.body).toMatchObject({
    success: false,
    message: 'Credenciais CursEduca não configuradas no arranque',
  })
  expect(mockFetchCurseducaDataForSync).not.toHaveBeenCalled()
})

test('background CursEduca sync keeps the immediate 202 and records failure before finalization', async () => {
  mockGetOptionalCurseducaRuntimeSettings.mockReturnValueOnce({
    apiUrl: 'offline',
    accessToken: 'offline',
    apiKey: 'offline',
  })
  mockFetchCurseducaDataForSync.mockRejectedValueOnce(secret)
  const app = appForCentralError({
    kind: 'router',
    mountPath: '/api/curseduca',
    router: curseducaRouter,
  })

  const startResponse = await request(app).get('/api/curseduca/sync/universal/start')
    .query({ __bo2_offline_loopback: '1' })
  for (let attempt = 0; attempt < 10 && global.__curseducaSyncRunning; attempt += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  const statusResponse = await request(app).get('/api/curseduca/sync/status')
    .query({ __bo2_offline_loopback: '1' })

  expect(startResponse.status).toBe(202)
  expect(startResponse.body).toMatchObject({ success: true, started: true })
  expect(startResponse.body).not.toHaveProperty('code')
  expect(statusResponse.status).toBe(200)
  expect(statusResponse.body).toMatchObject({
    success: true,
    running: false,
    error: 'Erro ao executar sincronização CursEduca',
    result: null,
  })
  expect(statusResponse.body.finishedAt).not.toBeNull()
})