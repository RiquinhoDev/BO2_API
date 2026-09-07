import axios from 'axios'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    isAxiosError: jest.fn(() => false),
  },
  get: jest.fn(),
  post: jest.fn(),
  isAxiosError: jest.fn(() => false),
}))

jest.mock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers', () => {
  const actual = jest.requireActual('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers')
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      getHotmartAccessToken: jest.fn(),
      fetchAllHotmartUsers: jest.fn(),
      fetchBatchUserProgress: jest.fn(),
    },
  }
})

import {
  fetchBatchUserProgress,
  fetchUserLessons,
} from '../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport'
import hotmartAdapter from '../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import { CronJobDispatcher, type CronDispatchDependencies } from '../../../src/services/cron/scheduler/jobDispatcher'
import { normalizeHotmartSyncDispatch } from '../../../src/services/cron/scheduler/hotmartSyncDispatchNormalizer'
import { prepareHotmartSync } from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartSafety'
import syncReportsService from '../../../src/services/syncUtilizadoresServices/syncReports.service'
import SyncReport from '../../../src/models/SyncModels/SyncReport'
import User from '../../../src/models/user'
import { loadConfig } from '../../../src/config/appConfig'
import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../../src/config/runtimeConfig'

const testConfig = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-characters',
  OLD_API_JWT_SECRET: 'test-only-old-api-jwt-secret-at-least-32-characters',
  STUDENT_ACCESS_JWT_SECRET: 'test-only-student-access-jwt-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: 'test-only-ac-webhook-secret-at-least-32-characters',
  HOTMART_CLIENT_ID: 'client',
  HOTMART_CLIENT_SECRET: 'secret',
  HOTMART_SUBDOMAIN: 'ogi',
}

const hooks = () => ({
  assertOwnership: jest.fn(),
  providerStarted: jest.fn(),
  providerSucceeded: jest.fn(),
  localMutationStarted: jest.fn(),
})

const collectionRead = (rows: unknown[] = []) => ({
  sort: () => ({
    limit: () => ({
      toArray: async () => rows,
    }),
  }),
})

describe('Task 8 review round 1 safety regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    initializeRuntimeConfig(loadConfig(testConfig))
  })
  afterEach(() => {
    jest.restoreAllMocks()
    resetRuntimeConfigForTests()
  })

  test('normalizer rejects mode mismatch, non-boolean dryRun, errors in success and plan contradictions', () => {
    const normalize = normalizeHotmartSyncDispatch as unknown as (value: unknown, options: unknown) => { success: boolean }
    expect(normalize({
      success: true,
      dryRun: 'false',
      stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
    }, { requestedDryRun: false }).success).toBe(false)

    expect(normalize({
      success: true,
      stats: { total: 1, inserted: 1, updated: 0, errors: 1, skipped: 0 },
    }, { requestedDryRun: false }).success).toBe(false)

    expect(normalize({
      success: true,
      dryRun: true,
      stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
    }, { requestedDryRun: true }).success).toBe(false)

    expect(normalize({
      success: true,
      dryRun: true,
      stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
      plan: {
        operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
        limit: 20_000, total: 2, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
      },
    }, { requestedDryRun: true }).success).toBe(false)
  })

  test('progress request hooks fence every request and provider errors escape the batch', async () => {
    const phaseHooks = hooks()
    jest.mocked(axios.get).mockRejectedValueOnce(new Error('provider body secret@example.test token'))
    const fetchProgress = fetchBatchUserProgress as unknown as (...args: unknown[]) => Promise<unknown>

    await expect(fetchProgress(
      [{ id: 'h-1', email: 'secret@example.test', name: 'A' }],
      'token',
      1,
      { phaseHooks },
    )).rejects.toThrow('provider body')
    expect(phaseHooks.assertOwnership).toHaveBeenCalled()
    expect(phaseHooks.providerStarted).toHaveBeenCalled()
    expect(phaseHooks.providerSucceeded).not.toHaveBeenCalled()
  })

  test('ownership loss in a lesson request prevents the provider call and escapes', async () => {
    const phaseHooks = hooks()
    phaseHooks.assertOwnership.mockImplementation(() => { throw new Error('lease lost') })
    const fetchLessons = fetchUserLessons as unknown as (...args: unknown[]) => Promise<unknown>

    await expect(fetchLessons('h-1', 'token', { phaseHooks })).rejects.toThrow('lease lost')
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('provider adapter validates the complete raw snapshot before progress enrichment', async () => {
    const phaseHooks = hooks()
    jest.spyOn(hotmartAdapter, 'fetchHotmartDataForSync')
    const helpers = jest.requireMock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers').default as Record<string, jest.Mock>
    helpers.getHotmartAccessToken.mockResolvedValue('token')
    helpers.fetchAllHotmartUsers.mockResolvedValue([
      { id: 'h-1', email: 'ok@example.test', name: 'A' },
      { id: 'h-2', email: '', name: 'Missing email' },
    ])
    helpers.fetchBatchUserProgress.mockResolvedValue(new Map())

    await expect(hotmartAdapter.fetchHotmartDataForSync({
      includeProgress: true,
      includeLessons: true,
      phaseHooks,
    })).rejects.toThrow()
    expect(helpers.fetchBatchUserProgress).not.toHaveBeenCalled()
  })

  test('Hotmart dispatcher sanitizes provider and UniversalSync details', async () => {
    const dependencies = {
      fetchHotmart: jest.fn(async () => { throw new Error('provider body token secret@example.test') }),
      fetchCurseduca: jest.fn(async () => []),
      executeUniversalSync: jest.fn(),
    } as unknown as CronDispatchDependencies
    const dispatcher = new CronJobDispatcher(dependencies)

    const result = await dispatcher.execute({
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      name: 'Job de Hotmart',
      syncType: 'hotmart',
    }, { triggeredBy: 'MANUAL' })

    expect(result).toMatchObject({ success: false, errorMessage: 'Execução Hotmart sync falhou' })
    expect(JSON.stringify(result)).not.toContain('secret@example.test')
    expect(JSON.stringify(result)).not.toContain('provider body')
  })

  test('report helper rechecks ownership after its snapshot read and before report write', async () => {
    jest.spyOn(User, 'countDocuments').mockResolvedValue(0 as never)
    const create = jest.spyOn(SyncReport, 'create').mockResolvedValue({ _id: 'report-id' } as never)
    const phaseHooks = hooks()
    phaseHooks.assertOwnership.mockImplementationOnce(() => { throw new Error('lease lost') })

    const createSyncReportForTest = syncReportsService.createSyncReport as unknown as (options: unknown, hooks: unknown) => Promise<unknown>
    await expect(createSyncReportForTest({
      jobName: 'Job de Hotmart', syncType: 'hotmart', triggeredBy: 'MANUAL',
      syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
    }, phaseHooks)).rejects.toThrow('lease lost')
    expect(create).not.toHaveBeenCalled()
  })

  test('rejects an under-item Hotmart source whose projected effects exceed the aggregate cap', async () => {
    jest.spyOn(User.collection, 'find').mockReturnValue(collectionRead() as never)
    const source = Array.from({ length: 4_000 }, (_, index) => ({
      email: `u-${index}@example.test`,
      name: 'User',
      hotmartUserId: `h-${index}`,
      classId: `class-${index}`,
    }))

    await expect(prepareHotmartSync(source, true)).rejects.toThrow('HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED')
  })
})
