import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

const mockFetchHotmartDataForSync = jest.fn()
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync: mockFetchHotmartDataForSync },
}))

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import CompositeExecutionReceipt from '../../../src/models/CompositeExecutionReceipt'
import CronExecution from '../../../src/models/cron/CronExecution'
import {
  executeCompositeExecutionReceipt,
  runCompositeExecutionWithReceipt,
  type CompositeExecutionOptions,
} from '../../../src/services/cron/compositeExecution.service'
import { executeSyncAndPreparationSteps } from '../../../src/services/cron/dailyPipelineSyncSteps'
import { DAILY_PIPELINE_MAX_ITEMS, getProductsConfig } from '../../../src/services/cron/dailyPipelineSupport'
import type { DailyPipelineResult } from '../../../src/types/cron.types'
import { runCleanupManually } from '../../../src/jobs/cronExecutionCleanup.job'
import { runMainParityExecution } from '../../../src/services/renewal/mainParityExecution'
import logger from '../../../src/utils/logger'

jest.setTimeout(30_000)

let mongoServer: MongoMemoryServer

const options = (
  requestId: string,
  run: CompositeExecutionOptions<{ value: string }>['run'],
  overrides: Partial<CompositeExecutionOptions<{ value: string }>> = {},
): CompositeExecutionOptions<{ value: string }> => ({
  operation: 'sync-pipeline',
  identity: 'daily-pipeline',
  actorId: 'actor-a',
  fingerprint: 'fingerprint-a',
  requestId,
  run,
  ...overrides,
})

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'composite_execution_receipt_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('composite_execution_receipt_test')),
  )
  await CompositeExecutionReceipt.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await CompositeExecutionReceipt.deleteMany({})
  mockFetchHotmartDataForSync.mockReset()
})

test('records the original execution failure before returning indeterminate', async () => {
  const log = jest.spyOn(logger, 'error').mockImplementation(() => undefined as never)
  const failure = new Error('sales provider timeout')
  try {
    await expect(executeCompositeExecutionReceipt(options('diagnostic-sales', async context => {
      context.provider.begin()
      throw failure
    }))).resolves.toEqual({ kind: 'indeterminate' })
    expect(log).toHaveBeenCalledWith('Composite execution failed', expect.objectContaining({
      operation: 'sync-pipeline', identity: 'daily-pipeline', requestId: 'diagnostic-sales',
      error: failure,
    }))
  } finally {
    log.mockRestore()
  }
})

test.each(['indeterminate', 'expired', 'missing-lease', 'running'])(
  'product sales retries abandoned %s receipts but preserves active exclusion', async (state) => {
    const at = new Date()
    await CompositeExecutionReceipt.create({
      operation: 'sync-pipeline', identity: 'renewal-parity:product-sales-performance-sync',
      actorId: 'actor-a', fingerprint: 'old', requestId: 'old-sales', ownerId: 'old-owner',
      status: state === 'indeterminate' ? 'indeterminate' : 'running',
      providerStatus: 'unknown', startedAt: new Date(at.getTime() - 300_000),
      ...(state === 'missing-lease' ? {} : {
        leaseExpiresAt: new Date(at.getTime() + (state === 'running' ? 300_000 : -1)),
      }),
    })
    const execute = (id: string) => runMainParityExecution({
      job: 'product-sales-performance-sync', payload: {}, effect: 'provider-and-local',
      req: { get: () => id, user: { email: 'actor-a' } } as never,
      res: { locals: {} } as never, run: async () => ({ salesFound: 42, errors: [] }),
    })
    if (state === 'running') {
      await expect(execute('new-sales')).rejects.toMatchObject({ code: 'COMPOSITE_EXECUTION_IN_PROGRESS' })
      expect(await CompositeExecutionReceipt.countDocuments({ status: 'running' })).toBe(1)
    } else {
      await expect(execute('new-sales')).resolves.toEqual({ salesFound: 42, errors: [] })
      expect(await CompositeExecutionReceipt.findOne({ requestId: 'old-sales' }).lean())
        .toMatchObject({ status: 'failed', providerStatus: 'unknown' })
      expect(await CompositeExecutionReceipt.findOne({ requestId: 'new-sales' }).lean())
        .toMatchObject({ status: 'completed' })
    }
  },
)

function pipelineResult(): DailyPipelineResult {
  return {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      preCreateTags: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} },
      syncTestimonialTags: { success: false, duration: 0, stats: {} },
    },
    errors: [],
    summary: { totalUsers: 0, totalUserProducts: 0, engagementUpdated: 0, tagsApplied: 0 },
  }
}

test('keeps an oversized read-only pipeline payload reusable instead of indeterminate', async () => {
  mockFetchHotmartDataForSync.mockResolvedValue(
    Array.from({ length: DAILY_PIPELINE_MAX_ITEMS + 1 }, () => ({})),
  )
  const config = {
    hotmart: { products: [{ code: 'HOTMART_PRODUCT' }] },
    curseduca: { products: [] },
  } as unknown as Awaited<ReturnType<typeof getProductsConfig>>
  const run: CompositeExecutionOptions<{ value: string }>['run'] = async (context) => {
    await executeSyncAndPreparationSteps(
      pipelineResult(),
      [],
      {
        providerStarted: context.provider.begin,
        providerSucceeded: context.provider.success,
        localMutationStarted: context.localMutation.begin,
      },
      config,
    )
    return { value: 'not-reached' }
  }

  await expect(executeCompositeExecutionReceipt(options('oversized-read', run)))
    .rejects.toMatchObject({ code: 'SYNC_PIPELINE_CAP_EXCEEDED', status: 413 })
  expect(await CompositeExecutionReceipt.findOne({ requestId: 'oversized-read' }).lean())
    .toMatchObject({ status: 'failed', providerStatus: 'not-started' })

  await expect(executeCompositeExecutionReceipt(options('oversized-read', run)))
    .rejects.toMatchObject({ code: 'SYNC_PIPELINE_CAP_EXCEEDED', status: 413 })
  expect(mockFetchHotmartDataForSync).toHaveBeenCalledTimes(2)
})

test('replays the stored result for the same request and fingerprint', async () => {
  let calls = 0
  const first = await executeCompositeExecutionReceipt(options('request-a', async (context) => {
    calls += 1
    context.provider.begin()
    context.provider.success()
    context.localMutation.begin()
    return { value: 'first' }
  }))

  const replay = await executeCompositeExecutionReceipt(options('request-a', async () => {
    calls += 1
    return { value: 'must-not-run' }
  }))

  expect(first).toEqual({ kind: 'completed', result: { value: 'first' } })
  expect(replay).toEqual({ kind: 'replay', result: { value: 'first' } })
  expect(calls).toBe(1)
})

test('rejects request-id reuse when actor or payload fingerprint changes', async () => {
  await executeCompositeExecutionReceipt(options('request-a', async () => ({ value: 'first' })))

  const reused = await executeCompositeExecutionReceipt(options('request-a', async () => ({ value: 'second' }), {
    actorId: 'actor-b',
    fingerprint: 'fingerprint-b',
  }))

  expect(reused).toEqual({ kind: 'request-id-reused' })
  expect(await CompositeExecutionReceipt.countDocuments({})).toBe(1)
})

test('rejects cross-entry request replay when the response contract differs', async () => {
  const direct = await executeCompositeExecutionReceipt(options('cross-entry-request', async () => ({
    value: 'daily-pipeline-contract',
  }), {
    fingerprint: 'direct-entrypoint-daily-pipeline',
  }))

  const cron = await executeCompositeExecutionReceipt(options('cross-entry-request', async () => ({
    value: 'cron-execution-contract',
  }), {
    operation: 'sync-pipeline',
    identity: 'daily-pipeline',
    fingerprint: 'cron-entrypoint-cron-execution',
  }))

  expect(direct).toEqual({ kind: 'completed', result: { value: 'daily-pipeline-contract' } })
  expect(cron).toEqual({ kind: 'request-id-reused' })
})

test('uses generic public receipt errors for cron jobs', async () => {
  const first = await runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity: 'cron-job:discord-scheduled-messages',
    actorId: 'actor-a',
    fingerprint: 'cron-fingerprint-a',
    requestId: 'cron-request-a',
    run: async () => ({ value: 'first' }),
  })
  expect(first).toEqual({ value: 'first' })

  await expect(runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity: 'cron-job:discord-scheduled-messages',
    actorId: 'actor-b',
    fingerprint: 'cron-fingerprint-b',
    requestId: 'cron-request-a',
    run: async () => ({ value: 'must-not-run' }),
  })).rejects.toMatchObject({
    code: 'COMPOSITE_EXECUTION_REQUEST_ID_REUSED',
    status: 409,
  })
})

test('fences concurrent A/B executions for the same pipeline identity', async () => {
  let started = 0
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })

  const firstPromise = executeCompositeExecutionReceipt(options('request-a', async (context) => {
    started += 1
    context.provider.begin()
    await barrier
    context.provider.success()
    return { value: 'first' }
  }))

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (started > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })

  const second = await executeCompositeExecutionReceipt(options('request-b', async () => ({ value: 'second' })))
  release()
  const first = await firstPromise

  expect(second).toEqual({ kind: 'in-progress' })
  expect(first).toEqual({ kind: 'completed', result: { value: 'first' } })
})

test('coordinates automatic and manual pipeline entries through one active identity', async () => {
  let started = 0
  let effectCount = 0
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })

  const manual = executeCompositeExecutionReceipt({
    ...options('manual-pipeline-entry', async (context) => {
      context.provider.begin()
      started += 1
      await barrier
      context.provider.success()
      effectCount += 1
      return { value: 'manual' }
    }),
    actorId: 'manual-actor',
  })

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (started > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })

  const automatic = await executeCompositeExecutionReceipt({
    ...options('automatic-pipeline-entry', async () => ({ value: 'must-not-run' })),
    actorId: 'system:cron',
  })
  release()

  expect(automatic).toEqual({ kind: 'in-progress' })
  expect(await manual).toEqual({ kind: 'completed', result: { value: 'manual' } })
  expect(effectCount).toBe(1)
})

test('manual and automatic cleanup share one durable identity and each run deletes at most one batch', async () => {
  const now = new Date('2026-09-06T12:00:00.000Z')
  const oldStartTime = new Date('2026-01-01T00:00:00.000Z')
  await CronExecution.insertMany(Array.from({ length: 150 }, () => ({
    cronName: 'cleanup-fixture',
    executionType: 'automatic',
    status: 'success',
    startTime: oldStartTime,
    endTime: oldStartTime,
    duration: 1,
  })))

  const identity = 'cron-job:cleanup-fixture'
  const run = (actorId: string, requestId: string) => runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity,
    actorId,
    fingerprint: `cleanup:${actorId}`,
    requestId,
    run: hooks => runCleanupManually({ phaseHooks: hooks, now: () => now }),
  })

  const manual = await run('manual-actor', 'cleanup-manual')
  expect(manual).toMatchObject({ success: true, deleted: 50, remaining: 100 })
  expect(await CronExecution.countDocuments({})).toBe(100)

  const replayRun = jest.fn(async () => ({ success: true }))
  const replay = await runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity,
    actorId: 'manual-actor',
    fingerprint: 'cleanup:manual-actor',
    requestId: 'cleanup-manual',
    run: replayRun,
  })
  expect(replay).toMatchObject({ deleted: 50 })
  expect(replayRun).not.toHaveBeenCalled()
  expect(await CronExecution.countDocuments({})).toBe(100)

  const automatic = await run('system:cron', 'cleanup-automatic')
  expect(automatic).toMatchObject({ success: true, deleted: 0, remaining: 100 })
  expect(await CronExecution.countDocuments({})).toBe(100)
  expect(await CompositeExecutionReceipt.countDocuments({ operation: 'cron-job', identity })).toBe(2)

  await CronExecution.deleteMany({ cronName: 'cleanup-fixture' })
})

test('manual and automatic achievement evaluation share identity, replay, and concurrency fencing', async () => {
  const identity = 'cron-job:achievement-evaluation-fixture'
  let started = false
  let release!: () => void
  let signalStarted!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const startedSignal = new Promise<void>((resolve) => { signalStarted = resolve })
  const run = jest.fn(async () => {
    started = true
    signalStarted()
    await barrier
    return { success: true, total: 1, processed: 1, evaluated: 1, errors: 0 }
  })
  const entry = (actorId: string, requestId: string) => runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity,
    actorId,
    fingerprint: 'achievement-evaluation-fingerprint',
    requestId,
    run,
  })

  const manual = entry('manual-actor', 'achievement-manual')
  await startedSignal
  expect(started).toBe(true)

  await expect(entry('system:cron', 'achievement-automatic')).rejects.toMatchObject({
    code: 'COMPOSITE_EXECUTION_IN_PROGRESS',
    status: 409,
  })

  release()
  expect(await manual).toEqual({ success: true, total: 1, processed: 1, evaluated: 1, errors: 0 })

  const replay = await entry('manual-actor', 'achievement-manual')
  expect(replay).toEqual({ success: true, total: 1, processed: 1, evaluated: 1, errors: 0 })
  expect(run).toHaveBeenCalledTimes(1)
})

test('marks an expired running lease indeterminate without reopening work', async () => {
  const now = new Date()
  await CompositeExecutionReceipt.create({
    operation: 'sync-pipeline',
    identity: 'daily-pipeline',
    actorId: 'actor-a',
    fingerprint: 'fingerprint-a',
    requestId: 'stale-request',
    ownerId: 'stale-owner',
    status: 'running',
    providerStatus: 'not-started',
    startedAt: new Date(now.getTime() - 10_000),
    leaseExpiresAt: new Date(now.getTime() - 1),
  })

  const run = jest.fn(async () => ({ value: 'must-not-run' }))
  const result = await executeCompositeExecutionReceipt({
    ...options('new-request', run),
    now: () => now,
  })

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(run).not.toHaveBeenCalled()
  expect(await CompositeExecutionReceipt.findOne({ requestId: 'stale-request' }).lean())
    .toMatchObject({ status: 'indeterminate', providerStatus: 'unknown' })
})

test('ownership loss fences the execution before provider work starts', async () => {
  let release!: () => void
  let signalReady!: () => void
  let renewLease!: () => Promise<void>
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const ready = new Promise<void>((resolve) => { signalReady = resolve })
  const providerStarted = jest.fn()

  const execution = executeCompositeExecutionReceipt({
    ...options('owner-loss', async (context) => {
      renewLease = () => context.lease.renew()
      signalReady()
      await barrier
      context.lease.assertOwnership()
      providerStarted()
      context.provider.begin()
      context.provider.success()
      return { value: 'must-not-complete' }
    }),
  })

  await ready
  await CompositeExecutionReceipt.updateOne(
    { requestId: 'owner-loss' },
    { $set: { ownerId: 'recovered-owner' } },
  )
  // Trigger the failed renewal directly after fencing the owner. This makes
  // the ownership-loss proof independent of the heartbeat interval.
  await renewLease()
  release()

  expect(await execution).toEqual({ kind: 'indeterminate' })
  expect(providerStarted).not.toHaveBeenCalled()
})

test('ownership loss between phase boundaries prevents the next effect', async () => {
  let release!: () => void
  let signalReady!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const ready = new Promise<void>((resolve) => { signalReady = resolve })
  const nextEffect = jest.fn()

  const execution = runCompositeExecutionWithReceipt({
    operation: 'cron-job',
    identity: 'cron-job:ownership-boundary',
    actorId: 'actor-a',
    fingerprint: 'fingerprint-a',
    requestId: 'ownership-boundary',
    heartbeatMs: 1_000,
    run: async (hooks) => {
      hooks.providerStarted()
      signalReady()
      await barrier
      hooks.localMutationStarted()
      nextEffect()
      return { value: 'must-not-complete' }
    },
  })

  await ready
  await CompositeExecutionReceipt.updateOne(
    { requestId: 'ownership-boundary' },
    { $set: { ownerId: 'recovered-owner' } },
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100))
  release()

  await expect(execution).rejects.toMatchObject({
    code: 'COMPOSITE_EXECUTION_INDETERMINATE',
    status: 503,
  })
  expect(nextEffect).not.toHaveBeenCalled()
})

test('keeps provider status unknown when one of several provider phases fails', async () => {
  const result = await executeCompositeExecutionReceipt(options('partial-provider', async (context) => {
    context.provider.begin()
    context.provider.success()
    context.provider.begin()
    return { value: 'partial' }
  }))

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(await CompositeExecutionReceipt.findOne({ requestId: 'partial-provider' }).lean())
    .toMatchObject({ status: 'indeterminate', providerStatus: 'unknown' })
})

test('turns provider/local failure, stale ownership and settlement failure into indeterminate', async () => {
  const first = await executeCompositeExecutionReceipt(options('request-a', async (context) => {
    context.provider.begin()
    context.provider.success()
    context.localMutation.begin()
    throw new Error('local failure')
  }))
  expect(first).toEqual({ kind: 'indeterminate' })

  const retry = await executeCompositeExecutionReceipt(options('request-b', async () => ({ value: 'retry' })))
  expect(retry).toEqual({ kind: 'indeterminate' })
  await CompositeExecutionReceipt.deleteMany({})

  const original = CompositeExecutionReceipt.findOneAndUpdate.bind(CompositeExecutionReceipt)
  const settlement = jest.spyOn(CompositeExecutionReceipt, 'findOneAndUpdate')
  settlement.mockImplementation(((filter: unknown, update: unknown, queryOptions: unknown) => {
    const status = (update as { $set?: { status?: string } }).$set?.status
    if (status === 'completed') {
      return { exec: () => Promise.reject(new Error('settlement failure')) } as never
    }
    return original(filter as never, update as never, queryOptions as never)
  }) as never)

  try {
    const indeterminate = await executeCompositeExecutionReceipt(options('request-c', async (context) => {
      context.provider.begin()
      context.provider.success()
      return { value: 'settlement' }
    }))
    expect(indeterminate).toEqual({ kind: 'indeterminate' })
    expect(await CompositeExecutionReceipt.findOne({ requestId: 'request-c' }).lean())
      .toMatchObject({ status: 'indeterminate', providerStatus: 'succeeded' })
  } finally {
    settlement.mockRestore()
  }
})
