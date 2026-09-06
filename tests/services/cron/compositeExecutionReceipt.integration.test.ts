import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import CompositeExecutionReceipt from '../../../src/models/CompositeExecutionReceipt'
import {
  executeCompositeExecutionReceipt,
  runCompositeExecutionWithReceipt,
  type CompositeExecutionOptions,
} from '../../../src/services/cron/compositeExecution.service'

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
