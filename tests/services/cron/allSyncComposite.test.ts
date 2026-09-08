import {
  ALL_SYNC_EFFECTIVE_MUTATION_LIMIT,
  ALL_SYNC_SOURCE_LIMIT,
  runAllSyncs,
} from '../../../src/services/cron/scheduler/allSyncComposite'
import {
  getCronManualCapability,
  cronManualExecutionView,
} from '../../../src/services/cron/scheduler/manualCapabilities'
import { assertManualExecutionEnabled } from '../../../src/services/cron/scheduler/manualExecutionGuards'
import { loadConfig } from '../../../src/config/appConfig'
import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../../src/config/runtimeConfig'

const job = (name = 'Nightly aggregate', syncType: string = 'all') => ({
  _id: { toString: () => 'all-job-id' },
  name,
  syncType,
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
  CURSEDUCA_API_URL: 'https://curseduca.invalid',
  CURSEDUCA_API_KEY: 'key',
  CURSEDUCA_AccessToken: 'token',
}

const source = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
  email: `${prefix}-${index}@x.test`,
  name: 'User',
}))

describe('all cron composite', () => {
  it('uses the exact persisted all syncType and never a display-name substring', () => {
    expect(getCronManualCapability(job())).toEqual(expect.objectContaining({
      id: 'all-sync',
      status: 'implemented',
      cap: expect.objectContaining({
        status: 'verified',
        limit: ALL_SYNC_SOURCE_LIMIT,
      }),
      killSwitch: expect.objectContaining({
        reason: 'ALL_SYNC_MANUAL_EXECUTION_ENABLED',
      }),
    }))
    expect(getCronManualCapability(job('NightlyAllSync', 'hotmart')).status).toBe('blocked')
    expect(getCronManualCapability(job('Nightly aggregate', 'unknown')).status).toBe('blocked')
  })

  it('is default-off and requires both provider credentials when enabled', () => {
    expect(loadConfig(credentialsEnv).core.allSyncManualExecutionEnabled).toBe(false)
    expect(loadConfig({
      ...credentialsEnv,
      ALL_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
    }).core.allSyncManualExecutionEnabled).toBe(true)
    expect(() => loadConfig({
      ...credentialsEnv,
      ALL_SYNC_MANUAL_EXECUTION_ENABLED: 'yes',
    })).toThrow('ALL_SYNC_MANUAL_EXECUTION_ENABLED deve ser true ou false')
    expect(() => loadConfig({
      ...credentialsEnv,
      ALL_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
      CURSEDUCA_API_URL: undefined,
      CURSEDUCA_API_KEY: undefined,
      CURSEDUCA_AccessToken: undefined,
    })).toThrow('ALL_SYNC_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart e CursEduca completas')
    expect(cronManualExecutionView(job(), false)).toMatchObject({
      capability: 'all-sync',
      mutableEnabled: false,
      dryRunSupported: true,
    })
  })

  it('keeps the all mutation guard default-off and permits it only after the typed flag', async () => {
    const capability = getCronManualCapability(job())
    try {
      initializeRuntimeConfig(loadConfig(credentialsEnv))
      await expect(assertManualExecutionEnabled(capability)).rejects.toMatchObject({
        status: 503,
        code: 'ALL_SYNC_MANUAL_EXECUTION_DISABLED',
      })
      resetRuntimeConfigForTests()
      initializeRuntimeConfig(loadConfig({
        ...credentialsEnv,
        ALL_SYNC_MANUAL_EXECUTION_ENABLED: 'true',
      }))
      await expect(assertManualExecutionEnabled(capability)).resolves.toBeUndefined()
    } finally {
      resetRuntimeConfigForTests()
    }
  })

  it('propagates options, preflights both children before live writes, and reports Discord as a no-op', async () => {
    const order: string[] = []
    const fetchHotmart = jest.fn(async () => {
      order.push('hotmart-source')
      return source('h', 2)
    })
    const fetchCurseduca = jest.fn(async () => {
      order.push('curseduca-source')
      return source('c', 2)
    })
    const executeUniversalSync = jest.fn(async (request: { syncType: string; dryRun?: boolean; phaseHooks?: unknown }) => {
      order.push(`${request.syncType}-${request.dryRun === true ? 'preflight' : 'live'}`)
      return {
        success: true,
        dryRun: request.dryRun,
        stats: request.dryRun
          ? { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }
          : { total: 2, inserted: 1, updated: 1, errors: 0, skipped: 0 },
        ...(request.dryRun ? { plan: {
          operation: `${request.syncType}-sync`, dryRun: true, truncated: false, anomaly: false,
          limit: 20_000, total: 2, inserted: 1, updated: 1, errors: 0, skipped: 0, remaining: 0,
          projectedMutations: 4,
        } } : {}),
      }
    })
    const phaseHooks = { assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn() }

    const result = await runAllSyncs(job(), {
      dryRun: false,
      phaseHooks,
      triggeredBy: 'MANUAL',
      fetchHotmart,
      fetchCurseduca,
      executeUniversalSync,
    })

    expect(fetchHotmart).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false, phaseHooks, triggeredBy: 'MANUAL' }))
    expect(fetchCurseduca).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false, phaseHooks, triggeredBy: 'MANUAL' }))
    expect(executeUniversalSync).toHaveBeenNthCalledWith(1, expect.objectContaining({ syncType: 'hotmart', dryRun: true, triggeredBy: 'MANUAL' }))
    expect(executeUniversalSync).toHaveBeenNthCalledWith(2, expect.objectContaining({ syncType: 'curseduca', dryRun: true, triggeredBy: 'MANUAL' }))
    expect(executeUniversalSync.mock.calls[0][0].phaseHooks).toEqual(expect.objectContaining({ assertOwnership: phaseHooks.assertOwnership }))
    expect(executeUniversalSync.mock.calls[0][0].phaseHooks).not.toBe(phaseHooks)
    expect(executeUniversalSync.mock.calls[2][0]).toEqual(expect.objectContaining({ syncType: 'hotmart', dryRun: false, triggeredBy: 'MANUAL', phaseHooks }))
    expect(executeUniversalSync.mock.calls[3][0]).toEqual(expect.objectContaining({ syncType: 'curseduca', dryRun: false, triggeredBy: 'MANUAL', phaseHooks }))
    expect(order.indexOf('curseduca-preflight')).toBeLessThan(order.indexOf('hotmart-live'))
    expect(order.indexOf('hotmart-preflight')).toBeLessThan(order.indexOf('hotmart-live'))
    expect(result).toMatchObject({
      success: true,
      stats: { total: 4, inserted: 2, updated: 2, errors: 0, skipped: 1 },
      data: { discord: { status: 'skipped', reason: 'not-configured' } },
    })
    expect(result.plan).toBeUndefined()
    expect(ALL_SYNC_EFFECTIVE_MUTATION_LIMIT).toBe(20_000)
  })

  it('keeps dry-run read-only while returning both child plans and the Discord no-op', async () => {
    const executeUniversalSync = jest.fn(async (request: { syncType: string; dryRun?: boolean }) => ({
      success: true,
      dryRun: true,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      plan: {
        operation: `${request.syncType}-sync`, dryRun: true, truncated: false, anomaly: false,
        limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
        projectedMutations: 8,
      },
    }))

    const result = await runAllSyncs(job(), {
      dryRun: true,
      fetchHotmart: async () => source('h', 1),
      fetchCurseduca: async () => source('c', 1),
      executeUniversalSync,
    })

    expect(executeUniversalSync).toHaveBeenCalledTimes(2)
    expect(executeUniversalSync.mock.calls.every(([request]) => request.dryRun === true)).toBe(true)
    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 1 },
      plan: {
        operation: 'all-sync',
        projectedMutations: 16,
        hotmart: { operation: 'hotmart-sync', projectedMutations: 8 },
        curseduca: { operation: 'curseduca-sync', projectedMutations: 8 },
        discord: { status: 'skipped', reason: 'not-configured' },
      },
    })
  })

  it.each([
    ['hotmart source overflow', source('h', ALL_SYNC_SOURCE_LIMIT + 1), source('c', 1)],
    ['curseduca source overflow', source('h', 1), source('c', ALL_SYNC_SOURCE_LIMIT + 1)],
    ['aggregate source overflow', source('h', ALL_SYNC_SOURCE_LIMIT), source('c', 1)],
  ])('%s rejects before the first child mutation', async (_label, hotmartData, curseducaData) => {
    const executeUniversalSync = jest.fn()
    await expect(runAllSyncs(job(), {
      fetchHotmart: async () => hotmartData,
      fetchCurseduca: async () => curseducaData,
      executeUniversalSync,
    })).rejects.toThrow()
    expect(executeUniversalSync).not.toHaveBeenCalled()
  })

  it('rejects a combined effective-mutation overflow before either live child starts', async () => {
    const executeUniversalSync = jest.fn(async (request: { syncType: string; dryRun?: boolean }) => ({
      success: true,
      dryRun: request.dryRun,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      plan: request.dryRun ? {
        operation: `${request.syncType}-sync`, dryRun: true, truncated: false, anomaly: false,
        limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
        projectedMutations: ALL_SYNC_EFFECTIVE_MUTATION_LIMIT,
      } : undefined,
    }))

    const result = await runAllSyncs(job(), {
      fetchHotmart: async () => source('h', 1),
      fetchCurseduca: async () => source('c', 1),
      executeUniversalSync,
    })

    expect(result).toMatchObject({ success: false, errorMessage: 'Execução All sync falhou' })
    expect(executeUniversalSync).toHaveBeenCalledTimes(2)
    expect(executeUniversalSync.mock.calls.every(([request]) => request.dryRun === true)).toBe(true)
  })

  it('never reports composite success when one child fails', async () => {
    const result = await runAllSyncs(job(), {
      fetchHotmart: async () => source('h', 1),
      fetchCurseduca: async () => source('c', 1),
      executeUniversalSync: async (request) => {
        if (request.syncType === 'curseduca') throw new Error('provider-secret')
        return { success: true, stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0 } }
      },
    })
    expect(result).toMatchObject({ success: false, stats: { errors: 1 }, errorMessage: 'Execução All sync falhou' })
    expect(result.errorMessage).not.toContain('provider-secret')
  })

  it('stops the second live writer after the first live child fails', async () => {
    const executeUniversalSync = jest.fn(async (request: { syncType: string; dryRun?: boolean }) => {
      if (request.dryRun === true) {
        return {
          success: true,
          dryRun: true,
          stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
          plan: {
            operation: `${request.syncType}-sync`, dryRun: true, truncated: false, anomaly: false,
            limit: 20_000, total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, remaining: 0,
            projectedMutations: 1,
          },
        }
      }
      throw new Error('provider-secret')
    })

    const result = await runAllSyncs(job(), {
      fetchHotmart: async () => source('h', 1),
      fetchCurseduca: async () => source('c', 1),
      executeUniversalSync,
    })

    expect(result).toMatchObject({
      success: false,
      stats: { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 2 },
      errorMessage: 'Execução All sync falhou',
    })
    expect(executeUniversalSync).toHaveBeenCalledTimes(3)
    expect(executeUniversalSync.mock.calls[2][0]).toMatchObject({ syncType: 'hotmart', dryRun: false })
  })

  it('sanitizes a provider snapshot throw before either child mutation', async () => {
    const executeUniversalSync = jest.fn()
    const result = await runAllSyncs(job(), {
      fetchHotmart: async () => { throw new Error('provider-secret') },
      fetchCurseduca: async () => source('c', 1),
      executeUniversalSync,
    })

    expect(result).toEqual({
      success: false,
      stats: { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
      errorMessage: 'Execução All sync falhou',
    })
    expect(executeUniversalSync).not.toHaveBeenCalled()
  })
})
