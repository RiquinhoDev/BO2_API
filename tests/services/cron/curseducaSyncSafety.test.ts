import {
  getCronManualCapability,
  cronManualExecutionView,
} from '../../../src/services/cron/scheduler/manualCapabilities'
import { loadConfig } from '../../../src/config/appConfig'
import axios from 'axios'
import {
  fetchAllMembersMap,
  fetchAccessReport,
  fetchGroupMembersList,
  fetchProgressReport,
  enrichMemberFromBulk,
} from '../../../src/services/syncUtilizadoresServices/curseducaServices/curseducaReports.client'
import {
  CurseducaProviderReadBudget,
  fetchCurseducaPages,
} from '../../../src/services/syncUtilizadoresServices/curseducaServices/curseducaPagination'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../../src/config/runtimeConfig'
import { CronJobDispatcher, type CronDispatchDependencies } from '../../../src/services/cron/scheduler/jobDispatcher'
import { normalizeCurseducaSyncDispatch } from '../../../src/services/cron/scheduler/curseducaSyncDispatchNormalizer'
import { governCurseducaExecution, prepareCurseducaSync } from '../../../src/services/syncUtilizadoresServices/universalSync/curseducaSafety'
import { executeUniversalSync } from '../../../src/services/syncUtilizadoresServices/universalSync/executeUniversalSync'
import { persistUserProduct } from '../../../src/services/syncUtilizadoresServices/universalSync/userProductPersistence'
import { productsCache } from '../../../src/services/syncUtilizadoresServices/universalSync/productsCache'
import { applyAutoReactivation } from '../../../src/services/syncUtilizadoresServices/universalSync/renewalExecutor'
import User from '../../../src/models/user'
import { Product, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import UserSnapshot from '../../../src/models/UserSnapshot'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: jest.fn(() => false),
  },
  get: jest.fn(),
  isAxiosError: jest.fn(() => false),
}))

const curseducaJob = (name = 'Job de CursEduca', syncType: 'curseduca' | 'hotmart' = 'curseduca') => ({
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
  CURSEDUCA_API_URL: 'https://curseduca.example.test',
  CURSEDUCA_API_KEY: 'curseduca-api-key',
  CURSEDUCA_AccessToken: 'curseduca-access-token',
}

test('registers only the exact CursEduca job and exposes backend-owned state', () => {
  expect(getCronManualCapability(curseducaJob())).toEqual(expect.objectContaining({
    id: 'curseduca-sync',
    status: 'implemented',
    cap: expect.objectContaining({ status: 'verified', limit: 20_000 }),
    killSwitch: expect.objectContaining({ reason: 'CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED' }),
  }))
  expect(getCronManualCapability(curseducaJob('Nightly Job de CursEduca')).status).toBe('blocked')
  expect(getCronManualCapability(curseducaJob('Job de CursEduca', 'hotmart')).status).toBe('blocked')
  expect(cronManualExecutionView(curseducaJob(), false, {
    blockedReason: 'Execução manual do sync CursEduca desativada',
  })).toMatchObject({
    capability: 'curseduca-sync',
    mutableEnabled: false,
    dryRunSupported: true,
    blockedReason: 'Execução manual do sync CursEduca desativada',
  })
})

test('CursEduca manual switch is typed, strict, default-off, and credential-gated', () => {
  expect(loadConfig(credentialsEnv).core.curseducaSyncManualExecutionEnabled).toBe(false)
  expect(loadConfig({
    ...credentialsEnv,
    CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
  }).core.curseducaSyncManualExecutionEnabled).toBe(true)
  expect(() => loadConfig({
    ...credentialsEnv,
    CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED: 'yes',
  })).toThrow('CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED deve ser true ou false')
  expect(() => loadConfig({
    ...credentialsEnv,
    CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
    CURSEDUCA_API_URL: undefined,
    CURSEDUCA_API_KEY: undefined,
    CURSEDUCA_AccessToken: undefined,
  })).toThrow('CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais CursEduca completas')
})

beforeEach(() => {
  jest.clearAllMocks()
  initializeRuntimeConfig(loadConfig({
    ...credentialsEnv,
    CURSEDUCA_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
  }))
})

afterEach(() => {
  jest.restoreAllMocks()
  resetRuntimeConfigForTests()
})

test('rejects malformed CursEduca collection aliases before accumulation', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [], members: [] } } as never)

  await expect(fetchGroupMembersList(10, {})).rejects.toThrow('CURSEDUCA_PROVIDER_ENVELOPE_INVALID')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('rejects an over-cap CursEduca page before appending overflow', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({
    data: { data: Array.from({ length: 101 }, (_, index) => ({ id: index + 1 })) },
  } as never)

  await expect(fetchGroupMembersList(10, {})).rejects.toThrow('CURSEDUCA_PROVIDER_PAGE_SIZE_EXCEEDED')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('shares the provider item budget across independent CursEduca collections', async () => {
  const budget = new CurseducaProviderReadBudget(2)
  const request = jest.fn()
    .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] })
    .mockResolvedValueOnce({ data: [{ id: 3 }] })

  await expect(fetchCurseducaPages<{ id: number }>({
    resource: 'groups', budget, request, identityOf: item => String(item.id),
  })).resolves.toHaveLength(2)
  await expect(fetchCurseducaPages<{ id: number }>({
    resource: 'members', budget, request, identityOf: item => String(item.id),
  })).rejects.toThrow('CURSEDUCA_PROVIDER_ITEM_LIMIT_EXCEEDED')
})

test('fails closed after a CursEduca member page cannot be read', async () => {
  jest.mocked(axios.get).mockRejectedValue(new Error('provider body must not escape'))

  await expect(fetchAllMembersMap({})).rejects.toThrow('CURSEDUCA_PROVIDER_READ_FAILED')
  expect(axios.get).toHaveBeenCalledTimes(3)
})

test('treats malformed progress/detail HTTP-200 data as provider failure', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [{ enrollment: { progress: 0 } }] } } as never)
  await expect(fetchProgressReport(10, 'Clareza', {})).rejects.toThrow('CURSEDUCA_PROVIDER_IDENTITY_INVALID')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('rejects a progress detail without a numeric progress value', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [
    { id: 'progress-1', member: { id: 7 }, enrollment: {} },
  ] } } as never)
  await expect(fetchProgressReport(10, 'Clareza', {})).rejects.toThrow('CURSEDUCA_PROVIDER_DATA_INVALID')
})

test('rejects bulk members without a situation instead of defaulting ACTIVE', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [
    { id: 7, groups: [{ groupId: 10 }] },
  ] } } as never)
  await expect(fetchAllMembersMap({})).rejects.toThrow('CURSEDUCA_PROVIDER_DATA_INVALID')
})

test('rejects roster enrichment when the complete bulk snapshot is missing', () => {
  expect(() => enrichMemberFromBulk({
    id: 7, uuid: 'u-7', name: 'Member', email: 'member@example.test', progress: 20,
    enrollmentsCount: 1, groups: [], enteredAt: '2026-09-01',
  }, 10, 'Clareza', new Map(), new Set([7]))).toThrow('CURSEDUCA_PROVIDER_DATA_INVALID')
})

test('does not query Product after the CursEduca product snapshot is loaded', async () => {
  productsCache.loadSnapshot([])
  const findOne = jest.spyOn(Product, 'findOne').mockReturnValue({
    select: () => ({ lean: async () => null }),
  } as never)
  await expect(persistUserProduct({
    item: { email: 'cache-miss@example.test', name: 'Cache miss', groupId: 'g-1', subscriptionType: 'MONTHLY' },
    syncType: 'curseduca', user: { email: 'cache-miss@example.test' } as never, userId: 'u-1',
  })).resolves.toEqual({ status: 'missing-product' })
  expect(findOne).not.toHaveBeenCalled()
})

test('allows distinct progress events for one member and keeps the maximum', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [
    { member: { id: 7 }, finishedAt: '2026-09-01', enrollment: { progress: 20 } },
    { member: { id: 7 }, finishedAt: '2026-09-02', enrollment: { progress: 80 } },
  ] } } as never)
  await expect(fetchProgressReport(10, 'Clareza', {})).resolves.toEqual(new Map([[7, { progress: 80, lastActivity: '2026-09-02' }]]))
})

test('rejects repeated access report identity before aggregation', async () => {
  const row = { id: 'access-1', createdAt: '2026-09-08T00:00:00.000Z', member: { email: 'a@example.test' } }
  jest.mocked(axios.get)
    .mockResolvedValueOnce({ data: { data: [row, row] } } as never)
  await expect(fetchAccessReport({})).rejects.toThrow('CURSEDUCA_PROVIDER_IDENTITY_REPEATED')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('rejects an access detail without a usable member email', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [
    { id: 'access-1', createdAt: '2026-09-08T00:00:00.000Z', member: { uuid: 'member-1' } },
  ] } } as never)
  await expect(fetchAccessReport({})).rejects.toThrow('CURSEDUCA_PROVIDER_DATA_INVALID')
})

test('rejects top-level versus nested continuation contradictions', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [{ id: 1, email: 'a@example.test' }], hasMore: false, metadata: { hasMore: true } } } as never)
  await expect(fetchGroupMembersList(10, {})).rejects.toThrow('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('rejects a terminal aggregate whose declared total is not met', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: [{ id: 1, email: 'a@example.test' }], metadata: { total: 2, hasMore: false } } } as never)
  await expect(fetchGroupMembersList(10, {})).rejects.toThrow('CURSEDUCA_PROVIDER_PAGINATION_INVALID')
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('uses a reached declared total as terminal even for a full page', async () => {
  jest.mocked(axios.get).mockResolvedValueOnce({ data: { data: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })), metadata: { total: 100 } } } as never)
  await expect(fetchGroupMembersList(10, {})).resolves.toHaveLength(100)
  expect(axios.get).toHaveBeenCalledTimes(1)
})

test('always returns CursEduca mutation governance, including no-hook callers', () => {
  const plan = {
    projectedEffects: 1,
    consumedEffects: 0,
    consumeMutation: (count = 1) => {
      if (count > 1) throw new Error('CURSEDUCA_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED')
    },
  } as never
  const governed = governCurseducaExecution(plan)
  expect(governed).toBeDefined()
  expect(() => governed!.consumeMutation?.(2)).toThrow('CURSEDUCA_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED')
})

test('normalizes only a coherent CursEduca dry-run plan', () => {
  const plan = { operation: 'curseduca-sync', dryRun: true, truncated: false, anomaly: false, limit: 20_000, total: 2, inserted: 1, updated: 1, errors: 0, skipped: 0, remaining: 0 }
  expect(normalizeCurseducaSyncDispatch({ success: true, dryRun: true, stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }, plan }, { requestedDryRun: true })).toMatchObject({ success: true, dryRun: true, plan })
  expect(normalizeCurseducaSyncDispatch({ success: true, dryRun: true, stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }, plan: { ...plan, updated: 2 } }, { requestedDryRun: true })).toMatchObject({ success: false, errorMessage: 'Execução CursEduca sync falhou' })
  expect(normalizeCurseducaSyncDispatch({ success: true, stats: { total: 1, inserted: 0, updated: 0, errors: 0, skipped: 0, unchanged: 1 } })).toMatchObject({ success: true, stats: { total: 1, errors: 0 } })
})

test('dispatcher keeps CursEduca dry-run bounded and forwards phase hooks', async () => {
  const hooks = { providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn() }
  const executeUniversalSync = jest.fn().mockResolvedValue({
    success: true, dryRun: true,
    stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
    plan: { operation: 'curseduca-sync', dryRun: true, truncated: false, anomaly: false, limit: 20_000, total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0, remaining: 0 },
  })
  const dependencies = {
    evaluateRules: jest.fn(), resetCounters: jest.fn(), rebuildDashboardStats: jest.fn(), cleanupExecutions: jest.fn(), weeklyTagSnapshot: jest.fn(), clarezaRefresh: jest.fn(), guruTrialCheck: jest.fn(), syncRenewalOffers: jest.fn(), runScheduledMessages: jest.fn(), runDiscordRolesSync: jest.fn(), runRenewalAcSync: jest.fn(), evaluateAchievements: jest.fn(), executeDailyPipeline: jest.fn(), fetchHotmart: jest.fn(), fetchCurseduca: jest.fn().mockResolvedValue([]), executeUniversalSync,
  } as unknown as CronDispatchDependencies
  const result = await new CronJobDispatcher(dependencies).execute(curseducaJob(), { dryRun: true, triggeredBy: 'MANUAL', phaseHooks: hooks })
  expect(result).toMatchObject({ success: true, dryRun: true, plan: { operation: 'curseduca-sync' } })
  expect(dependencies.fetchCurseduca).toHaveBeenCalledWith({ dryRun: true, triggeredBy: 'MANUAL', phaseHooks: hooks })
  expect(executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({ syncType: 'curseduca', dryRun: true, phaseHooks: hooks }))
})

test('CursEduca UniversalSync preview reads a bounded plan and performs no writes', async () => {
  const rows = { sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }
  for (const model of [User, Product, Class, UserProduct, UserSnapshot]) jest.spyOn(model.collection, 'find').mockReturnValue(rows as never)
  const result = await executeUniversalSync({
    syncType: 'curseduca', jobName: 'Job de CursEduca', triggeredBy: 'MANUAL', dryRun: true,
    fullSync: true, includeProgress: true, includeTags: false, batchSize: 50,
    sourceData: [{ email: 'preview-curs@example.test', name: 'Preview', curseducaUserId: 'c-1', groupId: 'g-1' }],
  })
  expect(result).toMatchObject({ success: true, dryRun: true, plan: { operation: 'curseduca-sync', total: 1, inserted: 1 } })
  expect(result.reportId).toBeUndefined()
})

test('CursEduca plan preloads every user product and budgets history fan-out', async () => {
  const source = [{ email: 'fanout@example.test', name: 'Fanout', curseducaUserId: 'c-1', groupId: 'g-1' }]
  const query = (rows: unknown[]) => ({ sort: () => ({ limit: () => ({ toArray: async () => rows }) }) })
  jest.spyOn(User.collection, 'find').mockReturnValue(query([{ _id: 'u-1', email: source[0].email, name: 'Fanout' }]) as never)
  jest.spyOn(Product.collection, 'find').mockReturnValue(query([]) as never)
  jest.spyOn(Class.collection, 'find').mockReturnValue(query([]) as never)
  const userProductsFind = jest.spyOn(UserProduct.collection, 'find').mockReturnValue(query([
    { _id: 'up-hot', userId: 'u-1', platform: 'hotmart', status: 'INACTIVE', classes: [{ classId: 'h-1' }] },
    { _id: 'up-curs', userId: 'u-1', platform: 'curseduca', status: 'PARA_INATIVAR', classes: [{ classId: 'g-1' }] },
  ]) as never)
  jest.spyOn(UserSnapshot.collection, 'find').mockReturnValue(query([{
    _id: 'snap-1', userId: 'u-1', snapshotDate: '2026-09-01', products: [{ classes: [{ classId: 'old-1' }] }],
  }]) as never)

  const result = await prepareCurseducaSync(source, true)

  expect(userProductsFind).toHaveBeenCalledWith({ userId: { $in: ['u-1'] } }, expect.anything())
  expect(result.executionPlan.userProducts).toHaveLength(2)
  expect(result.executionPlan.reactivationTargetsByUser).toEqual({ 'u-1': 2 })
  expect(result.executionPlan.renewalTargetsByUser).toEqual({ 'u-1': 2 })
  expect(result.executionPlan.projectedEffects).toBeGreaterThan(20)
})

test('renewal mutation scopes planned user products and statuses', async () => {
  const updateMany = jest.spyOn(UserProduct, 'updateMany').mockResolvedValue({ matchedCount: 1 } as never)
  await applyAutoReactivation(
    'u-1',
    'renewal@example.test',
    { shouldReactivate: true, reactivationReason: 'sync', evidence: { kind: 'purchase', purchaseDate: new Date('2026-09-01'), daysSincePurchase: 7 } },
    undefined,
    1,
    [
      { _id: 'up-inactive', userId: 'u-1', platform: 'hotmart', status: 'INACTIVE' },
      { _id: 'up-active', userId: 'u-1', platform: 'curseduca', status: 'ACTIVE' },
    ],
  )
  expect(updateMany).toHaveBeenCalledWith({
    userId: 'u-1', _id: { $in: ['up-inactive'] }, status: { $in: ['INACTIVE', 'PARA_INATIVAR'] },
  }, { $set: { status: 'ACTIVE' } })
})

test('primary demotion fails closed when the planned incumbent changed', async () => {
  productsCache.loadSnapshot([{ _id: 'new-product', code: 'NEW', platform: 'curseduca', curseducaGroupId: 'g-new' } as never])
  const updateOne = jest.spyOn(UserProduct, 'updateOne').mockResolvedValue({ matchedCount: 0 } as never)
  const hooks = { assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn(), consumeMutation: jest.fn() }
  await expect(persistUserProduct({
    item: { email: 'primary@example.test', name: 'Primary', groupId: 'g-new', enrolledAt: '2026-09-01', platformData: { isPrimary: true } },
    syncType: 'curseduca', user: { email: 'primary@example.test' } as never, userId: 'u-1', phaseHooks: hooks,
    plannedUserProducts: [{ _id: 'old-up', userId: 'u-1', platform: 'curseduca', productId: 'old-product', status: 'ACTIVE', isPrimary: true, enrolledAt: '2025-01-01', updatedAt: 't0', classes: [] }],
  })).rejects.toThrow('CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT')
  expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({
    _id: 'old-up', userId: 'u-1', platform: 'curseduca', productId: 'old-product', isPrimary: true, status: 'ACTIVE', updatedAt: 't0',
  }), expect.anything())
})

test('CursEduca effective overflow rejects before any local read', async () => {
  const find = jest.spyOn(User.collection, 'find')
  const source = Array.from({ length: 20_001 }, (_, index) => ({ email: `c-${index}@example.test`, curseducaUserId: `c-${index}` }))
  await expect(prepareCurseducaSync(source, true)).rejects.toThrow('CURSEDUCA_SYNC_ITEM_LIMIT_EXCEEDED')
  expect(find).not.toHaveBeenCalled()
})
