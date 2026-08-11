import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express'
import request from 'supertest'
import {
  IntegrationUnavailableError,
  type IntegrationName,
} from '../../src/errors/integrationUnavailableError'
import type { AsyncRouteHandler } from '../../src/security/asyncRoute'
import { createErrorHandling } from '../../src/security/errorHandling'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { expectCentralError, type ExpectedCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const secretError = new Error('secret alice@example.test token=hidden')
const secretValue = 'secret alice@example.test token=hidden'
const mockAsyncRouteInvocations = jest.fn()
const mockExecuteDailyPipeline = jest.fn()
const mockExecuteUniversalSync = jest.fn()
const mockFetchHotmartDataForSync = jest.fn()
const mockFetchCurseducaDataForSync = jest.fn()
const mockSyncHistoryAggregate = jest.fn()
const mockSyncHistoryCountDocuments = jest.fn()
const mockSyncHistoryFind = jest.fn()
const mockSyncHistoryDeleteMany = jest.fn()
const mockSyncHistoryFindById = jest.fn()
const mockSyncHistoryFindByIdAndUpdate = jest.fn()
const mockSyncHistorySave = jest.fn()
const mockGetPendingConflicts = jest.fn()
const mockGetConflictStats = jest.fn()
const mockGetConflictsByType = jest.fn()
const mockGetConflictById = jest.fn()
const mockResolveConflict = jest.fn()
const mockBulkResolveConflicts = jest.fn()
const mockAutoResolveConflicts = jest.fn()
const mockIgnoreConflict = jest.fn()
const mockGetCriticalConflicts = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserFindById = jest.fn()
const mockUserFind = jest.fn()
const mockUserFindOneAndUpdate = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserHistoryInsertMany = jest.fn()
const mockUserHistoryDeleteMany = jest.fn()

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

jest.mock('../../src/services/cron/dailyPipeline.service', () => ({
  executeDailyPipeline: mockExecuteDailyPipeline,
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: mockExecuteUniversalSync },
}))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync: mockFetchHotmartDataForSync },
}))

jest.mock('../../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter', () => ({
  __esModule: true,
  default: { fetchCurseducaDataForSync: mockFetchCurseducaDataForSync },
}))

jest.mock('../../src/models/SyncHistory', () => {
  const model = jest.fn().mockImplementation((document: object) => ({
    ...document,
    save: mockSyncHistorySave,
  }))
  Object.assign(model, {
    aggregate: mockSyncHistoryAggregate,
    countDocuments: mockSyncHistoryCountDocuments,
    find: mockSyncHistoryFind,
    deleteMany: mockSyncHistoryDeleteMany,
    findById: mockSyncHistoryFindById,
    findByIdAndUpdate: mockSyncHistoryFindByIdAndUpdate,
  })
  return { __esModule: true, default: model }
})

jest.mock('../../src/models/SyncModels/SyncHistory', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}))

jest.mock('../../src/services/syncUtilizadoresServices/activitySnapshot.service', () => ({
  __esModule: true,
  default: { getMonthlyStats: jest.fn() },
}))

jest.mock('../../src/services/syncUtilizadoresServices/conflictDetection.service', () => ({
  __esModule: true,
  default: {
    getPendingConflicts: mockGetPendingConflicts,
    getConflictStats: mockGetConflictStats,
    getConflictsByType: mockGetConflictsByType,
    getConflictById: mockGetConflictById,
    resolveConflict: mockResolveConflict,
    bulkResolveConflicts: mockBulkResolveConflicts,
    autoResolveConflicts: mockAutoResolveConflicts,
    ignoreConflict: mockIgnoreConflict,
    getCriticalConflicts: mockGetCriticalConflicts,
    getSyncConflicts: jest.fn(),
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
    findById: mockUserFindById,
    find: mockUserFind,
    findOneAndUpdate: mockUserFindOneAndUpdate,
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind },
}))

jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: {
    insertMany: mockUserHistoryInsertMany,
    deleteMany: mockUserHistoryDeleteMany,
  },
}))

jest.mock('../../src/controllers/testHistory.controller', () => ({
  makeTestChanges: jest.fn((_req: Request, res: Response) => res.sendStatus(204)),
  revertTestChanges: jest.fn((_req: Request, res: Response) => res.sendStatus(204)),
}))

import syncRouter from '../../src/routes/sync.routes'
import syncStatsRouter from '../../src/routes/syncUtilizadoresRoutes/syncStats.routes'
import testHistoryRouter from '../../src/routes/testHistory.routes'

type HttpMethod = 'delete' | 'get' | 'post'

interface WaveRoute {
  method: HttpMethod
  path: string
  router: Router
  mountPath: string
}

interface BoundaryCase extends WaveRoute {
  name: string
  arrange: (failure: unknown) => void
  expected: ExpectedCentralError
  body?: object
  validated?: boolean
}

interface IntegrationUnavailableCase {
  name: string
  operation: BoundaryCase
  integration: IntegrationName
}

const syncRoute = (method: HttpMethod, path: string): WaveRoute => ({
  method,
  path: `/api/sync${path}`,
  router: syncRouter,
  mountPath: '/api/sync',
})

const conflictRoute = (method: HttpMethod, path: string): WaveRoute => ({
  method,
  path: `/api/sync${path}`,
  router: syncStatsRouter,
  mountPath: '/api/sync',
})

const historyRoute = (path: string): WaveRoute => ({
  method: 'post',
  path: `/api/test/history${path}`,
  router: testHistoryRouter,
  mountPath: '/api/test/history',
})

function rejectUserList(failure: unknown): void {
  mockUserFind.mockReturnValue({
    limit: jest.fn().mockReturnValue({
      select: jest.fn().mockRejectedValue(failure),
    }),
  })
}

const boundaryCases: BoundaryCase[] = [
  {
    name: 'list sync history', ...syncRoute('get', '/history'),
    arrange: failure => { mockSyncHistoryAggregate.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HISTORY_LIST_FAILED', message: 'Erro ao buscar histórico de sincronizações' },
  },
  {
    name: 'read sync statistics', ...syncRoute('get', '/stats'),
    arrange: failure => { mockSyncHistoryCountDocuments.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas de sincronização' },
  },
  {
    name: 'clean old sync history', ...syncRoute('delete', '/history/clean?days=30'), validated: true,
    arrange: failure => { mockSyncHistoryDeleteMany.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HISTORY_CLEAN_FAILED', message: 'Erro ao limpar histórico' },
  },
  {
    name: 'retry a sync operation', ...syncRoute('post', '/history/507f1f77bcf86cd799439011/retry'),
    arrange: failure => { mockSyncHistoryFindById.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HISTORY_RETRY_FAILED', message: 'Erro ao fazer retry da sincronização' },
  },
  {
    name: 'create a sync record', ...syncRoute('post', '/history'), body: { type: 'hotmart' },
    arrange: failure => { mockSyncHistorySave.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HISTORY_CREATE_FAILED', message: 'Erro ao criar registo de sincronização' },
  },
  {
    name: 'execute the daily pipeline', ...syncRoute('post', '/execute-pipeline'), validated: true,
    arrange: failure => { mockExecuteDailyPipeline.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_PIPELINE_EXECUTION_FAILED', message: 'Erro fatal ao executar pipeline' },
  },
  {
    name: 'sync one Hotmart user', ...syncRoute('post', '/hotmart'), body: { email: 'student@example.test', subdomain: 'course' },
    arrange: failure => { mockFetchHotmartDataForSync.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HOTMART_USER_FAILED', message: 'Erro ao sincronizar Hotmart' },
  },
  {
    name: 'sync a Hotmart batch', ...syncRoute('post', '/hotmart/batch'), body: { subdomain: 'course' },
    arrange: failure => { mockFetchHotmartDataForSync.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_HOTMART_BATCH_FAILED', message: 'Erro ao sincronizar Hotmart batch' },
  },
  {
    name: 'sync one CursEduca user', ...syncRoute('post', '/curseduca'), body: { email: 'student@example.test' },
    arrange: failure => { mockFetchCurseducaDataForSync.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CURSEDUCA_USER_FAILED', message: 'Erro ao sincronizar CursEduca' },
  },
  {
    name: 'sync a CursEduca batch', ...syncRoute('post', '/curseduca/batch'),
    arrange: failure => { mockFetchCurseducaDataForSync.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CURSEDUCA_BATCH_FAILED', message: 'Erro ao sincronizar CursEduca batch' },
  },
  {
    name: 'list conflicts', ...conflictRoute('get', '/conflicts'),
    arrange: failure => { mockGetPendingConflicts.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_LIST_FAILED', message: 'Erro ao buscar conflitos' },
  },
  {
    name: 'read one conflict', ...conflictRoute('get', '/conflicts/507f1f77bcf86cd799439011'),
    arrange: failure => { mockGetConflictById.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_READ_FAILED', message: 'Erro ao buscar conflito' },
  },
  {
    name: 'resolve one conflict', ...conflictRoute('post', '/conflicts/507f1f77bcf86cd799439011/resolve'), body: { action: 'MERGED' },
    arrange: failure => { mockResolveConflict.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_RESOLVE_FAILED', message: 'Erro ao resolver conflito' },
  },
  {
    name: 'bulk resolve conflicts', ...conflictRoute('post', '/conflicts/bulk-resolve'), body: { conflictIds: ['507f1f77bcf86cd799439011'], action: 'MERGED' },
    arrange: failure => { mockBulkResolveConflicts.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_BULK_RESOLVE_FAILED', message: 'Erro ao resolver conflitos' },
  },
  {
    name: 'auto resolve conflicts', ...conflictRoute('post', '/conflicts/auto-resolve'), body: { conflictIds: ['507f1f77bcf86cd799439011'] },
    arrange: failure => { mockAutoResolveConflicts.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_AUTO_RESOLVE_FAILED', message: 'Erro ao auto-resolver conflitos' },
  },
  {
    name: 'ignore one conflict', ...conflictRoute('post', '/conflicts/507f1f77bcf86cd799439011/ignore'),
    arrange: failure => { mockIgnoreConflict.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_IGNORE_FAILED', message: 'Erro ao ignorar conflito' },
  },
  {
    name: 'list critical conflicts', ...conflictRoute('get', '/conflicts/critical'),
    arrange: failure => { mockGetCriticalConflicts.mockRejectedValueOnce(failure) },
    expected: { code: 'SYNC_CONFLICT_CRITICAL_LIST_FAILED', message: 'Erro ao buscar conflitos críticos' },
  },
  {
    name: 'populate retroactive history', ...historyRoute('/populate-retroactive'), body: { email: 'student@example.test' },
    arrange: failure => { mockUserFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'HISTORY_RETROACTIVE_POPULATE_FAILED', message: 'Erro ao popular histórico retroativo' },
  },
  {
    name: 'delete test history events', ...historyRoute('/delete-test-events'), validated: true, body: { email: 'student@example.test' },
    arrange: failure => { mockUserHistoryDeleteMany.mockRejectedValueOnce(failure) },
    expected: { code: 'HISTORY_TEST_EVENTS_DELETE_FAILED', message: 'Erro ao apagar eventos de teste' },
  },
  {
    name: 'populate all users history', ...historyRoute('/populate-all-users'),
    arrange: rejectUserList,
    expected: { code: 'HISTORY_ALL_USERS_POPULATE_FAILED', message: 'Erro ao popular histórico de todos os users' },
  },
]

interface ObservedApp {
  app: express.Express
  delegated: jest.Mock<void, [unknown]>
  logError: jest.Mock
}

function buildApp(route: WaveRoute): ObservedApp {
  const app = express()
  const delegated = jest.fn<void, [unknown]>()
  const logError = jest.fn()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'sec10-sync-request',
    logError,
  })
  const observeDelegation: ErrorRequestHandler = (error, _req, _res, next) => {
    delegated(error)
    next(error)
  }

  app.use(express.json())
  app.use(errors.correlationId)
  app.use(route.mountPath, route.router)
  app.use(observeDelegation)
  app.use(errors.handler)
  return { app, delegated, logError }
}

function callRoute(route: WaveRoute, body: object = {}): {
  observed: ObservedApp
  response: Promise<request.Response>
} {
  const observed = buildApp(route)
  const separator = route.path.includes('?') ? '&' : '?'
  const path = `${route.path}${separator}__bo2_offline_loopback=1`
  const pending = request(observed.app)[route.method](path)
  return {
    observed,
    response: route.method === 'get' ? pending : pending.send(body),
  }
}

function arrangeDefaults(): void {
  mockSyncHistoryAggregate.mockResolvedValue([])
  mockSyncHistoryCountDocuments.mockResolvedValue(0)
  mockSyncHistoryFind.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) }),
    }),
  })
  mockSyncHistoryDeleteMany.mockResolvedValue({ deletedCount: 0 })
  mockSyncHistoryFindById.mockResolvedValue(null)
  mockSyncHistoryFindByIdAndUpdate.mockResolvedValue(null)
  mockSyncHistorySave.mockResolvedValue(undefined)
  mockGetPendingConflicts.mockResolvedValue([])
  mockGetConflictStats.mockResolvedValue({ total: 0 })
  mockGetConflictsByType.mockResolvedValue([])
  mockGetConflictById.mockResolvedValue(null)
  mockResolveConflict.mockResolvedValue({ status: 'RESOLVED' })
  mockBulkResolveConflicts.mockResolvedValue(0)
  mockAutoResolveConflicts.mockResolvedValue({ resolved: 0, skipped: 0, errors: [] })
  mockIgnoreConflict.mockResolvedValue({ status: 'IGNORED' })
  mockGetCriticalConflicts.mockResolvedValue([])
  mockFetchHotmartDataForSync.mockResolvedValue([])
  mockFetchCurseducaDataForSync.mockResolvedValue([])
  mockExecuteUniversalSync.mockResolvedValue({
    success: true,
    stats: { total: 1, successful: 1, failed: 0 },
    reportId: 'report-id',
    duration: 12,
  })
  mockUserFindOne.mockResolvedValue(null)
  mockUserFindById.mockResolvedValue(null)
  mockUserFind.mockReturnValue({
    limit: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) }),
  })
  mockUserProductFind.mockReturnValue({
    populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
  })
  mockUserHistoryInsertMany.mockResolvedValue([])
  mockUserHistoryDeleteMany.mockResolvedValue({ deletedCount: 0 })
  mockUserFindOneAndUpdate.mockResolvedValue(null)
}

beforeEach(() => {
  jest.clearAllMocks()
  arrangeDefaults()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('SEC-10 sync, conflict and history boundary wave', () => {
  it('contains the exact 21-site migration membership with stable distinct codes', () => {
    expect(boundaryCases).toHaveLength(20)
    const codes = [
      ...boundaryCases.map(operation => operation.expected.code),
      'SYNC_PIPELINE_COMPLETED_WITH_ERRORS',
    ]
    expect(new Set(codes).size).toBe(21)
  })

  it.each(boundaryCases)('$name sends Error failures through one central boundary', async operation => {
    operation.arrange(secretError)
    const { observed, response } = callRoute(operation, operation.body)

    const result = await response

    expect(observed.delegated).toHaveBeenCalledTimes(1)
    expectCentralError(result, {
      ...operation.expected,
      correlationId: 'sec10-sync-request',
    })
    expect(observed.logError).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
    expect(mockAsyncRouteInvocations).toHaveBeenCalledTimes(operation.validated ? 0 : 1)
  })

  it.each([
    boundaryCases[0],
    boundaryCases[5],
    boundaryCases[10],
    boundaryCases[17],
  ])('$name normalizes a non-Error rejection with the operation code', async operation => {
    operation.arrange(secretValue)
    const { response } = callRoute(operation, operation.body)

    expectCentralError(await response, {
      ...operation.expected,
      correlationId: 'sec10-sync-request',
    })
  })

  it.each<IntegrationUnavailableCase>([
    { name: 'Hotmart user', operation: boundaryCases[6], integration: 'hotmart' },
    { name: 'Hotmart batch', operation: boundaryCases[7], integration: 'hotmart' },
    { name: 'CursEduca user', operation: boundaryCases[8], integration: 'curseduca' },
    { name: 'CursEduca batch', operation: boundaryCases[9], integration: 'curseduca' },
  ])('preserves $name integration-unavailable classification', async ({ operation, integration }) => {
    operation.arrange(new IntegrationUnavailableError(integration))
    const { observed, response } = callRoute(operation, operation.body)

    const result = await response

    expect(observed.delegated).toHaveBeenCalledTimes(1)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({
      success: false,
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível',
      correlationId: 'sec10-sync-request',
    })
  })

  it('centralizes an operationally partial pipeline once and logs redacted metrics', async () => {
    mockExecuteDailyPipeline.mockResolvedValueOnce({
      success: false,
      duration: 17,
      errors: [secretValue],
      steps: {
        syncHotmart: {
          success: false,
          duration: 4,
          stats: { failed: 2, secretValue },
          error: secretValue,
        },
      },
    })
    const route = syncRoute('post', '/execute-pipeline')
    const { observed, response } = callRoute(route)

    const result = await response

    expect(observed.delegated).toHaveBeenCalledTimes(1)
    expectCentralError(result, {
      code: 'SYNC_PIPELINE_COMPLETED_WITH_ERRORS',
      message: 'Pipeline executado com erros',
      correlationId: 'sec10-sync-request',
    })
    expect(observed.logError).toHaveBeenCalledTimes(1)
    expect(observed.logError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SYNC_PIPELINE_COMPLETED_WITH_ERRORS',
      detail: JSON.stringify({
        duration: 17,
        errorCount: 1,
        steps: [{ name: 'syncHotmart', success: false, duration: 4 }],
      }),
    }))
    expect(console.error).not.toHaveBeenCalled()
    expect(JSON.stringify(result.body)).not.toContain(secretValue)
    expect(JSON.stringify(observed.logError.mock.calls)).not.toMatch(
      /secret|alice@example\.test|token=hidden/,
    )
  })
})

describe('preserved sync and conflict contracts', () => {
  it('preserves sync history list and statistics success envelopes', async () => {
    mockSyncHistoryAggregate
      .mockResolvedValueOnce([{ _id: 'history-id', stats: { total: 2, errors: 0 } }])
      .mockResolvedValueOnce([{ total: 1 }])
    const history = await callRoute(syncRoute('get', '/history?page=2&limit=5')).response

    expect(history.status).toBe(200)
    expect(history.body).toEqual({
      history: [{ _id: 'history-id', stats: { total: 2, errors: 0 } }],
      count: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
      filters: { type: null, status: null, startDate: null, endDate: null },
    })

    mockSyncHistoryCountDocuments
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    mockSyncHistoryAggregate
      .mockResolvedValueOnce([{ _id: 'hotmart', count: 4 }])
      .mockResolvedValueOnce([{ avgDuration: 12.4, avgRecordsPerSync: 9.6, avgSuccessRate: 75.2 }])
    const stats = await callRoute(syncRoute('get', '/stats')).response

    expect(stats.status).toBe(200)
    expect(stats.body).toEqual({
      overview: { totalSyncs: 4, completedSyncs: 3, failedSyncs: 1, runningSyncs: 0, successRate: 75 },
      recentSyncs: [],
      typeStats: [{ _id: 'hotmart', count: 4 }],
      performance: { avgDuration: 12, avgRecordsPerSync: 10, avgSuccessRate: 75 },
    })
  })

  it('preserves clean and create history persistence responses', async () => {
    mockSyncHistoryDeleteMany.mockResolvedValueOnce({ deletedCount: 2 })
    const clean = await callRoute(syncRoute('delete', '/history/clean?days=30')).response
    expect(clean.status).toBe(200)
    expect(clean.body).toEqual(expect.objectContaining({
      message: 'Histórico limpo com sucesso. 2 registos removidos.',
      deletedCount: 2,
    }))
    expect(mockSyncHistoryDeleteMany).toHaveBeenCalledWith({
      startedAt: { $lt: expect.any(Date) },
      status: { $in: ['completed', 'failed', 'cancelled'] },
    })

    const create = await callRoute(
      syncRoute('post', '/history'),
      { type: 'hotmart', user: 'admin-id', metadata: { source: 'manual' } },
    ).response
    expect(create.status).toBe(201)
    expect(create.body).toEqual({
      message: 'Registo de sincronização criado.',
      syncRecord: {
        type: 'hotmart',
        user: 'admin-id',
        metadata: { source: 'manual' },
        status: 'pending',
      },
    })
    expect(mockSyncHistorySave).toHaveBeenCalledTimes(1)
  })

  it('preserves pipeline success with its complete summary and steps', async () => {
    mockExecuteDailyPipeline.mockResolvedValueOnce({
      success: true,
      duration: 14,
      summary: { totalUsers: 3, totalUserProducts: 5, engagementUpdated: 2, tagsApplied: 1 },
      steps: { syncHotmart: { success: true, duration: 2, stats: { total: 3 } } },
    })

    const result = await callRoute(syncRoute('post', '/execute-pipeline')).response

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      success: true,
      message: 'Pipeline executado com sucesso',
      duration: 14,
      summary: { totalUsers: 3, totalUserProducts: 5, engagementUpdated: 2, tagsApplied: 1 },
      steps: { syncHotmart: { success: true, duration: 2, stats: { total: 3 } } },
    })
  })

  it.each([
    { path: '/hotmart', body: { email: 'student@example.test', subdomain: 'course' }, adapter: mockFetchHotmartDataForSync, source: [{ email: 'student@example.test', id: 'hotmart-id' }], duration: false },
    { path: '/hotmart/batch', body: { subdomain: 'course' }, adapter: mockFetchHotmartDataForSync, source: [{ email: 'student@example.test', id: 'hotmart-id' }], duration: true },
    { path: '/curseduca', body: { email: 'student@example.test' }, adapter: mockFetchCurseducaDataForSync, source: [{ email: 'student@example.test', id: 'curseduca-id' }], duration: false },
    { path: '/curseduca/batch', body: {}, adapter: mockFetchCurseducaDataForSync, source: [{ email: 'student@example.test', id: 'curseduca-id' }], duration: true },
  ])('preserves POST /api/sync$path success data and counters', async contract => {
    contract.adapter.mockResolvedValueOnce(contract.source)
    const result = await callRoute(syncRoute('post', contract.path), contract.body).response

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      success: true,
      stats: { total: 1, successful: 1, failed: 0 },
      reportId: 'report-id',
      ...(contract.duration ? { duration: 12 } : {}),
    })
  })

  it('preserves conflict success envelopes and conflict statuses', async () => {
    const pendingConflict = { _id: 'conflict-id', status: 'PENDING', severity: 'HIGH' }
    mockGetPendingConflicts.mockResolvedValueOnce([pendingConflict])
    mockGetConflictStats.mockResolvedValueOnce({ total: 1, pending: 1 })
    mockGetConflictsByType.mockResolvedValueOnce([{ type: 'DUPLICATE_EMAIL', count: 1 }])
    const list = await callRoute(conflictRoute('get', '/conflicts')).response
    expect(list.body).toEqual({
      success: true,
      data: {
        total: 1,
        conflicts: [pendingConflict],
        stats: { total: 1, pending: 1 },
        byType: [{ type: 'DUPLICATE_EMAIL', count: 1 }],
      },
      meta: { message: 'Conflitos recuperados com sucesso' },
    })

    mockGetConflictById.mockResolvedValueOnce(pendingConflict)
    const read = await callRoute(conflictRoute('get', '/conflicts/507f1f77bcf86cd799439011')).response
    expect(read.body).toEqual({
      success: true,
      meta: { message: 'Conflito recuperado com sucesso' },
      data: { conflict: pendingConflict },
    })

    const resolvedConflict = { _id: 'conflict-id', status: 'RESOLVED' }
    mockResolveConflict.mockResolvedValueOnce(resolvedConflict)
    const resolved = await callRoute(
      conflictRoute('post', '/conflicts/507f1f77bcf86cd799439011/resolve'),
      { action: 'MERGED' },
    ).response
    expect(resolved.body).toEqual({
      success: true,
      meta: { message: 'Conflito resolvido com sucesso' },
      data: { conflict: resolvedConflict },
    })

    mockBulkResolveConflicts.mockResolvedValueOnce(2)
    const bulk = await callRoute(
      conflictRoute('post', '/conflicts/bulk-resolve'),
      { conflictIds: ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea'], action: 'MERGED' },
    ).response
    expect(bulk.body).toEqual({
      success: true,
      meta: { message: '2 conflitos resolvidos com sucesso' },
      data: { total: 2, resolved: 2 },
    })

    const autoResult = { resolved: 1, skipped: 1, errors: [] }
    mockAutoResolveConflicts.mockResolvedValueOnce(autoResult)
    const auto = await callRoute(
      conflictRoute('post', '/conflicts/auto-resolve'),
      { conflictIds: ['507f1f77bcf86cd799439011'] },
    ).response
    expect(auto.body).toEqual({
      success: true,
      meta: { message: 'Auto-resolução completa' },
      data: autoResult,
    })

    const ignoredConflict = { _id: 'conflict-id', status: 'IGNORED' }
    mockIgnoreConflict.mockResolvedValueOnce(ignoredConflict)
    const ignored = await callRoute(
      conflictRoute('post', '/conflicts/507f1f77bcf86cd799439011/ignore'),
      { reason: 'duplicate' },
    ).response
    expect(ignored.body).toEqual({
      success: true,
      meta: { message: 'Conflito ignorado com sucesso' },
      data: { conflict: ignoredConflict },
    })

    mockGetCriticalConflicts.mockResolvedValueOnce([pendingConflict])
    const critical = await callRoute(conflictRoute('get', '/conflicts/critical')).response
    expect(critical.body).toEqual({
      success: true,
      meta: { message: 'Conflitos críticos recuperados' },
      data: { total: 1, conflicts: [pendingConflict] },
    })
  })

  it('preserves retroactive history persistence order and complete success shape', async () => {
    mockUserFindOne.mockResolvedValueOnce({ _id: 'user-id', email: 'student@example.test' })
    const product = {
      productId: { name: 'Course', toString: () => 'product-id' },
      platform: 'hotmart',
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
    }
    mockUserProductFind.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([product]) }),
    })

    const result = await callRoute(
      historyRoute('/populate-retroactive'),
      { email: 'student@example.test' },
    ).response

    expect(mockUserHistoryInsertMany).toHaveBeenCalledTimes(1)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      success: true,
      meta: { message: 'Histórico retroativo criado com sucesso' },
      data: {
        userId: 'user-id',
        email: 'student@example.test',
        productsProcessed: 1,
        historyRecordsCreated: 1,
        events: [{
          date: '2026-01-01T00:00:00.000Z',
          type: 'PRODUCT_ADDED',
          description: 'Inscrito no produto Course',
        }],
      },
    })
  })

  it('keeps retry not-found and non-failed responses local', async () => {
    const route = syncRoute('post', '/history/507f1f77bcf86cd799439011/retry')

    const notFound = await callRoute(route).response
    expect(notFound.status).toBe(404)
    expect(notFound.body).toEqual({ message: 'Registo de sincronização não encontrado.' })

    mockSyncHistoryFindById.mockResolvedValueOnce({ status: 'completed' })
    const notFailed = await callRoute(route).response
    expect(notFailed.status).toBe(400)
    expect(notFailed.body).toEqual({ message: 'Apenas sincronizações falhadas podem ser repetidas.' })
  })

  it('keeps retry persistence semantics before returning pending', async () => {
    mockSyncHistoryFindById.mockResolvedValueOnce({ status: 'failed' })
    mockSyncHistoryFindByIdAndUpdate.mockResolvedValueOnce({ status: 'pending' })
    const route = syncRoute('post', '/history/507f1f77bcf86cd799439011/retry')

    const result = await callRoute(route).response

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      message: 'Sincronização marcada para retry.',
      syncId: '507f1f77bcf86cd799439011',
      newStatus: 'pending',
    })
    expect(mockSyncHistoryFindByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      {
        status: 'pending',
        completedAt: undefined,
        errorDetails: [],
        stats: { total: 0, added: 0, updated: 0, conflicts: 0, errors: 0 },
      },
    )
  })

  it.each([
    { path: '/history', body: {}, status: 400, bodyExpected: { message: 'Tipo de sincronização inválido.' } },
    { path: '/hotmart', body: {}, status: 400, bodyExpected: { success: false, message: 'Missing required fields: email, subdomain' } },
    { path: '/hotmart/batch', body: {}, status: 400, bodyExpected: { success: false, message: 'subdomain is required' } },
    { path: '/curseduca', body: {}, status: 400, bodyExpected: { success: false, message: 'Missing required field: email' } },
  ])('keeps POST /api/sync$path validation local', async contract => {
    const result = await callRoute(syncRoute('post', contract.path), contract.body).response
    expect(result.status).toBe(contract.status)
    expect(result.body).toEqual(contract.bodyExpected)
  })

  it.each([
    { path: '/hotmart', body: { email: 'missing@example.test', subdomain: 'course' }, adapter: mockFetchHotmartDataForSync, message: 'User não encontrado na API Hotmart' },
    { path: '/curseduca', body: { email: 'missing@example.test' }, adapter: mockFetchCurseducaDataForSync, message: 'User não encontrado na API CursEduca' },
  ])('keeps POST /api/sync$path not-found local', async contract => {
    contract.adapter.mockResolvedValueOnce([])
    const result = await callRoute(syncRoute('post', contract.path), contract.body).response
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ success: false, message: contract.message })
  })

  it.each([
    { path: '/conflicts/not-an-id', body: undefined },
    { path: '/conflicts/not-an-id/resolve', body: { action: 'MERGED' } },
    { path: '/conflicts/not-an-id/ignore', body: {} },
    { path: '/conflicts/507f1f77bcf86cd799439011/resolve', body: {} },
    { path: '/conflicts/507f1f77bcf86cd799439011/resolve', body: { action: 'INVALID' } },
    { path: '/conflicts/bulk-resolve', body: {} },
    { path: '/conflicts/bulk-resolve', body: { conflictIds: ['not-an-id'], action: 'MERGED' } },
    { path: '/conflicts/auto-resolve', body: {} },
    { path: '/conflicts/auto-resolve', body: { conflictIds: ['not-an-id'] } },
  ])('keeps conflict validation local for $path', async contract => {
    const method: HttpMethod = contract.path.endsWith('not-an-id') ? 'get' : 'post'
    const result = await callRoute(conflictRoute(method, contract.path), contract.body).response
    expect(result.status).toBe(400)
    expect(result.body.success).toBe(false)
  })

  it('keeps conflict not-found local', async () => {
    mockGetConflictById.mockResolvedValueOnce(null)
    const result = await callRoute(
      conflictRoute('get', '/conflicts/507f1f77bcf86cd799439011'),
    ).response
    expect(result.status).toBe(404)
    expect(result.body).toEqual({ success: false, message: 'Conflito não encontrado' })
  })

  it('preserves delete-test-events write order and response count', async () => {
    const order: string[] = []
    mockUserHistoryDeleteMany.mockImplementationOnce(async () => {
      order.push('deleteMany')
      return { deletedCount: 3 }
    })
    mockUserFindOneAndUpdate.mockImplementationOnce(async () => {
      order.push('findOneAndUpdate')
      return null
    })

    const result = await callRoute(
      historyRoute('/delete-test-events'),
      { email: 'student@example.test' },
    ).response

    expect(order).toEqual(['deleteMany', 'findOneAndUpdate'])
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      success: true,
      meta: { message: 'Eventos de teste apagados com sucesso' },
      data: { deletedCount: 3 },
    })
  })

  it('preserves populate-all partial failures and successful-user counters', async () => {
    mockUserFind.mockReturnValueOnce({
      limit: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { _id: 'failed-user', email: 'failed@example.test' },
          { _id: 'successful-user', email: 'successful@example.test' },
        ]),
      }),
    })
    mockUserProductFind
      .mockReturnValueOnce({ populate: jest.fn().mockRejectedValue(secretError) })
      .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([{ productId: 'product-id' }]) })

    const result = await callRoute(historyRoute('/populate-all-users')).response

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      success: true,
      meta: { message: 'Histórico retroativo criado para 1 users' },
      data: { usersProcessed: 1, totalRecords: 0 },
    })
  })
})
