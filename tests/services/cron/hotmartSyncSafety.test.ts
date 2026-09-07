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

import {
  getCronManualCapability,
  cronManualExecutionView,
} from '../../../src/services/cron/scheduler/manualCapabilities'
import { fetchAllHotmartUsers } from '../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport'
import { loadConfig } from '../../../src/config/appConfig'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../../src/config/runtimeConfig'
import { CronJobDispatcher, type CronDispatchDependencies } from '../../../src/services/cron/scheduler/jobDispatcher'
import { normalizeHotmartSyncDispatch } from '../../../src/services/cron/scheduler/hotmartSyncDispatchNormalizer'
import { executeUniversalSync } from '../../../src/services/syncUtilizadoresServices/universalSync/executeUniversalSync'
import User from '../../../src/models/user'

const hotmartJob = (name = 'Job de Hotmart', syncType: 'hotmart' | 'curseduca' = 'hotmart') => ({
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  name,
  syncType,
  syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
  tagRules: [],
  tagRuleOptions: {},
})

const credentialsEnv = {
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

beforeEach(() => {
  jest.clearAllMocks()
  initializeRuntimeConfig(loadConfig(credentialsEnv))
})

afterEach(() => {
  jest.restoreAllMocks()
  resetRuntimeConfigForTests()
})

test('registers only the exact Hotmart job and exposes backend-owned state', () => {
  expect(getCronManualCapability(hotmartJob())).toEqual(expect.objectContaining({
    id: 'hotmart-sync',
    status: 'implemented',
    cap: expect.objectContaining({ status: 'verified', limit: 20_000 }),
    killSwitch: expect.objectContaining({ reason: 'HOTMART_SYNC_MANUAL_EXECUTION_ENABLED' }),
  }))
  expect(getCronManualCapability(hotmartJob('Nightly Job de Hotmart')).status).toBe('blocked')
  expect(getCronManualCapability(hotmartJob('Job de Hotmart', 'curseduca')).status).toBe('blocked')
  expect(cronManualExecutionView(hotmartJob(), false, {
    blockedReason: 'Execução manual do sync Hotmart desativada',
  })).toMatchObject({
    capability: 'hotmart-sync',
    mutableEnabled: false,
    dryRunSupported: true,
    blockedReason: 'Execução manual do sync Hotmart desativada',
  })
})

test('Hotmart manual switch is strict, default-off, and credential-gated', () => {
  expect((loadConfig(credentialsEnv).core as any).hotmartSyncManualExecutionEnabled).toBe(false)
  expect((loadConfig({ ...credentialsEnv, HOTMART_SYNC_MANUAL_EXECUTION_ENABLED: 'true' })
    .core as any).hotmartSyncManualExecutionEnabled).toBe(true)
  expect(() => loadConfig({ ...credentialsEnv, HOTMART_SYNC_MANUAL_EXECUTION_ENABLED: 'yes' }))
    .toThrow('HOTMART_SYNC_MANUAL_EXECUTION_ENABLED deve ser true ou false')
  expect(() => loadConfig({
    ...credentialsEnv,
    HOTMART_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
    HOTMART_CLIENT_ID: undefined,
    HOTMART_CLIENT_SECRET: undefined,
    HOTMART_SUBDOMAIN: undefined,
  })).toThrow('HOTMART_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart completas')
})

test('rejects an over-cap Hotmart page before accumulating provider data', async () => {
  const users = Array.from({ length: 101 }, (_, index) => ({ id: `u-${index}`, email: `u-${index}@x.test`, name: 'User' }))
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { users, page_info: {} } } as never)

  await expect(fetchAllHotmartUsers('token')).rejects.toThrow('HOTMART_PROVIDER_PAGE_SIZE_EXCEEDED')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('rejects repeated Hotmart user identity and contradictory pagination before the next request', async () => {
  jest.mocked(axios.get)
    .mockResolvedValueOnce({ data: {
      users: [{ id: 'u-1', email: 'a@x.test', name: 'A' }],
      page_info: { next_page_token: 'next', has_more: true },
    } } as never)
    .mockResolvedValueOnce({ data: {
      users: [{ user_id: 'u-1', email: 'a@x.test', name: 'A' }],
      page_info: { next_page_token: 'next-2', has_more: true },
    } } as never)

  await expect(fetchAllHotmartUsers('token')).rejects.toThrow('HOTMART_PROVIDER_USER_DUPLICATE')
  expect(axios.get).toHaveBeenCalledTimes(2)
})

test('fails closed on malformed Hotmart envelopes and contradictory pagination aliases', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { users: [], items: [], page_info: {} } } as never)
  await expect(fetchAllHotmartUsers('token')).rejects.toThrow('HOTMART_PROVIDER_ENVELOPE_INVALID')

  jest.clearAllMocks()
  jest.mocked(axios.get).mockResolvedValueOnce({ data: {
    users: [{ id: 'u-1', email: 'a@x.test', name: 'A' }],
    page_info: { next_page_token: 'A' },
    next_page_token: 'B',
  } } as never)
  await expect(fetchAllHotmartUsers('token')).rejects.toThrow('HOTMART_PROVIDER_PAGINATION_CONFLICT')
})

test('rejects a repeated Hotmart cursor before issuing a third request', async () => {
  jest.mocked(axios.get)
    .mockResolvedValueOnce({ data: {
      users: [{ id: 'u-1', email: 'a@x.test', name: 'A' }],
      page_info: { next_page_token: 'next', has_more: true },
    } } as never)
    .mockResolvedValueOnce({ data: {
      users: [{ id: 'u-2', email: 'b@x.test', name: 'B' }],
      page_info: { next_page_token: 'next', has_more: true },
    } } as never)

  await expect(fetchAllHotmartUsers('token')).rejects.toThrow('HOTMART_PROVIDER_CURSOR_REPEATED')
  expect(axios.get).toHaveBeenCalledTimes(2)
})

test('supports the explicit top-level Hotmart cursor alias', async () => {
  jest.mocked(axios.get)
    .mockResolvedValueOnce({ data: {
      users: [{ id: 'u-1', email: 'a@x.test', name: 'A' }],
      next_page_token: 'next',
    } } as never)
    .mockResolvedValueOnce({ data: {
      users: [],
      next_page_token: null,
    } } as never)

  await expect(fetchAllHotmartUsers('token')).resolves.toHaveLength(1)
  expect(axios.get).toHaveBeenCalledTimes(2)
})

test('dispatcher forwards dry-run and ownership hooks through the Hotmart runner', async () => {
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  const dependencies = {
    fetchHotmart: jest.fn(async () => []),
    fetchCurseduca: jest.fn(async () => []),
    executeUniversalSync: jest.fn(async () => ({ success: true, stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 } })),
  } as unknown as CronDispatchDependencies
  const dispatcher = new CronJobDispatcher(dependencies)

  await dispatcher.execute(hotmartJob(), { dryRun: true, phaseHooks, triggeredBy: 'MANUAL' })

  expect(dependencies.fetchHotmart).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, phaseHooks }))
  expect(dependencies.executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
    triggeredBy: 'MANUAL',
    dryRun: true,
    phaseHooks,
  }))
})

test('UniversalSync preview performs bounded local preflight and no mutations', async () => {
  const find = jest.spyOn(User.collection, 'find').mockReturnValue({
    sort: () => ({
      limit: () => ({
        toArray: async () => [],
      }),
    }),
  } as never)
  const hooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  const result = await executeUniversalSync({
    syncType: 'hotmart',
    jobName: 'Job de Hotmart',
    triggeredBy: 'MANUAL',
    dryRun: true,
    phaseHooks: hooks,
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 50,
    sourceData: [{ email: 'a@x.test', name: 'A', hotmartUserId: 'h-1' }],
  })

  expect(find).toHaveBeenCalledWith(
    { email: { $in: ['a@x.test'] } },
    { projection: { _id: 1, email: 1 } },
  )
  expect(result).toMatchObject({
    success: true,
    dryRun: true,
    plan: expect.objectContaining({ operation: 'hotmart-sync', dryRun: true, limit: 20_000, inserted: 1 }),
  })
  expect(result.reportId).toBeUndefined()
  expect(hooks.localMutationStarted).not.toHaveBeenCalled()
})

test('UniversalSync rejects effective overflow before any local read or report', async () => {
  const find = jest.spyOn(User.collection, 'find')
  const sourceData = Array.from({ length: 20_001 }, (_, index) => ({
    email: `user-${index}@x.test`,
    name: 'User',
    hotmartUserId: `h-${index}`,
  }))

  await expect(executeUniversalSync({
    syncType: 'hotmart',
    jobName: 'Job de Hotmart',
    triggeredBy: 'MANUAL',
    dryRun: true,
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 50,
    sourceData,
  })).rejects.toThrow('HOTMART_SYNC_ITEM_LIMIT_EXCEEDED')
  expect(find).not.toHaveBeenCalled()
})

test('Hotmart dispatch normalizer is strict and strips non-contract plan fields', () => {
  expect(normalizeHotmartSyncDispatch({
    success: true,
    dryRun: true,
    stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
    plan: {
      operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
      limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
      internalId: 'must-not-leak',
    },
  })).toEqual({
    success: true,
    dryRun: true,
    stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 },
    plan: {
      operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
      limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
    },
  })
  expect(normalizeHotmartSyncDispatch({ success: true, stats: { total: 20_001, inserted: 0, updated: 0, errors: 0, skipped: 0 } })).toMatchObject({
    success: false,
    stats: { errors: 1 },
    errorMessage: 'Execução Hotmart sync falhou',
  })
})
