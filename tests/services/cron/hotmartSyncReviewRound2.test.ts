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

import { fetchBatchUserProgress } from '../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport'
import { assertHotmartUserMatchesPlan, prepareHotmartSync } from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartSafety'
import { executeUniversalSync } from '../../../src/services/syncUtilizadoresServices/universalSync/executeUniversalSync'
import { buildUserProductOptimisticFilter } from '../../../src/services/syncUtilizadoresServices/universalSync/userProductPersistence'
import { CronJobDispatcher, type CronDispatchDependencies } from '../../../src/services/cron/scheduler/jobDispatcher'
import { normalizeHotmartSyncDispatch } from '../../../src/services/cron/scheduler/hotmartSyncDispatchNormalizer'
import User from '../../../src/models/user'
import { Product, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import UserSnapshot from '../../../src/models/UserSnapshot'
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

const sourceFor = (size: number) => Array.from({ length: size }, (_, index) => ({
  email: `u-${index}@example.test`,
  name: 'User',
  hotmartUserId: `h-${index}`,
}))

beforeEach(() => {
  jest.clearAllMocks()
  initializeRuntimeConfig(loadConfig(testConfig))
})

afterEach(() => {
  jest.restoreAllMocks()
  resetRuntimeConfigForTests()
})

test('rejects 4,000 users when real minimum per-user effects exceed the cap', async () => {
  jest.spyOn(User.collection, 'find').mockReturnValue({
    sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
  } as never)

  await expect(prepareHotmartSync(sourceFor(4_000), true))
    .rejects.toThrow('HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED')
})

test('preview keeps zero effect stats while exposing predicted plan counts', async () => {
  const collectionRows = {
    sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
  }
  for (const model of [User, Product, Class, UserProduct, UserSnapshot]) {
    jest.spyOn(model.collection, 'find').mockReturnValue(collectionRows as never)
  }

  const result = await executeUniversalSync({
    syncType: 'hotmart',
    jobName: 'Job de Hotmart',
    triggeredBy: 'MANUAL',
    dryRun: true,
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 50,
    sourceData: [{ email: 'preview@example.test', name: 'Preview', hotmartUserId: 'h-preview' }],
  })

  expect(result.stats).toMatchObject({ total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 })
  expect(result.plan).toMatchObject({ total: 1, inserted: 1 })
})

test('normalizer rejects over-cap and malformed preview plans', () => {
  const base = {
    success: true,
    dryRun: true,
    stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
  }
  const plan = {
    operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
    limit: 20_000, total: 20_001, inserted: 20_001, updated: 0, errors: 0, skipped: 0, remaining: 0,
  }
  expect(normalizeHotmartSyncDispatch({ ...base, plan }, { requestedDryRun: true }).success).toBe(false)
  expect(normalizeHotmartSyncDispatch({
    ...base,
    plan: { ...plan, total: 1, inserted: 1, truncated: true },
  }, { requestedDryRun: true }).success).toBe(false)
  expect(normalizeHotmartSyncDispatch({
    ...base,
    stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
    plan: { ...plan, total: 1, inserted: 1 },
  }, { requestedDryRun: true }).success).toBe(false)
  expect(normalizeHotmartSyncDispatch({
    ...base,
    plan: { ...plan, total: 1, inserted: 1, errors: 1 },
  }, { requestedDryRun: true }).success).toBe(false)
})

test('lessons failure envelope escapes instead of persisting synthetic zero progress', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({
    data: { success: false, lessons: [], error: 'provider failed' },
  } as never)

  await expect(fetchBatchUserProgress([
    { id: 'h-1', email: 'student@example.test', name: 'Student' },
  ], 'token', 1)).rejects.toThrow('HOTMART_PROVIDER_LESSONS_FAILED')
})

test('dispatcher accepts the real preview accounting shape', async () => {
  const dependencies = {
    fetchHotmart: jest.fn(async () => []),
    fetchCurseduca: jest.fn(async () => []),
    executeUniversalSync: jest.fn(async () => ({
      success: true,
      dryRun: true,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      plan: {
        operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
        limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
      },
    })),
  } as unknown as CronDispatchDependencies
  const result = await new CronJobDispatcher(dependencies).execute({
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Job de Hotmart',
    syncType: 'hotmart',
  }, { dryRun: true, triggeredBy: 'MANUAL' })

  expect(result).toMatchObject({ success: true, dryRun: true, plan: { total: 1 } })
})

test('same-id changed user state fails the executable plan concurrency guard', () => {
  const planned = {
    _id: 'user-1',
    email: 'student@example.test',
    name: 'Before',
    classId: 'class-a',
    combined: { status: 'ACTIVE' },
    hotmart: { enrolledClasses: [{ classId: 'class-a', className: 'OGI 2601', isActive: true }] },
  }

  expect(() => assertHotmartUserMatchesPlan(planned, {
    ...planned,
    name: 'Changed concurrently',
  })).toThrow('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
})

test('same-id changed UserProduct cannot match the planned write predicate', () => {
  const planned = {
    _id: 'product-link-1',
    userId: 'user-1',
    productId: 'product-1',
    status: 'ACTIVE',
    updatedAt: new Date('2026-09-07T09:00:00.000Z'),
  }
  const predicate = buildUserProductOptimisticFilter(planned)

  expect(predicate).toMatchObject({
    _id: planned._id,
    userId: planned.userId,
    productId: planned.productId,
    updatedAt: planned.updatedAt,
  })
  expect({ ...planned, status: 'INACTIVE', updatedAt: new Date('2026-09-07T09:01:00.000Z') })
    .not.toMatchObject(predicate)
})
