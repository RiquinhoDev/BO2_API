import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../../src/errors/integrationUnavailableError'
import ClarezaRefreshExecutionReceipt from '../../../src/models/ClarezaRefreshExecutionReceipt'
import { createTestRuntimeConfig } from '../../support/runtimeConfig'
import {
  executeClarezaRefreshReceipt,
  runClarezaRefreshWithReceipt,
} from '../../../src/services/clareza/clarezaRefreshExecution.service'

jest.setTimeout(30_000)

let mongoServer: MongoMemoryServer

const options = (requestId: string, run: Parameters<typeof executeClarezaRefreshReceipt>[0]['run']) => ({
  operation: 'market' as const,
  identity: 'market-data',
  fingerprint: 'full',
  requestId,
  run,
})

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_refresh_receipt_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('clareza_refresh_receipt_test')),
  )
  await ClarezaRefreshExecutionReceipt.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ClarezaRefreshExecutionReceipt.deleteMany({})
})

test('replays the canonical result before a changed dependency or state can refresh again', async () => {
  let calls = 0
  const first = await executeClarezaRefreshReceipt(options('request-a', async (context) => {
    calls++
    context.provider.begin()
    context.provider.success()
    return { total: 10, errors: 1, state: 'first' }
  }))

  const replay = await executeClarezaRefreshReceipt(options('request-a', async () => {
    calls++
    throw new Error('replay must not execute')
  }))

  expect(first).toEqual({ kind: 'completed', result: { total: 10, errors: 1, state: 'first' } })
  expect(replay).toEqual({ kind: 'replay', result: { total: 10, errors: 1, state: 'first' } })
  expect(calls).toBe(1)
})

test('initializes receipt indexes before the first claim', async () => {
  const init = jest.spyOn(ClarezaRefreshExecutionReceipt, 'init')

  try {
    await executeClarezaRefreshReceipt(options('request-a', async () => ({ total: 1, errors: 0 })))
    expect(init).toHaveBeenCalled()
  } finally {
    init.mockRestore()
  }
})

test('successful provider and local persistence settles completed with the canonical result', async () => {
  const result = await executeClarezaRefreshReceipt(options('request-a', async (context) => {
    context.provider.begin()
    context.provider.success()
    context.localMutation.begin()
    return { total: 10, errors: 0 }
  }))

  expect(result).toEqual({ kind: 'completed', result: { total: 10, errors: 0 } })
  expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
    .toMatchObject({ status: 'completed', providerStatus: 'succeeded', result: { total: 10, errors: 0 } })
})

test('route helper records configured provider and local phases in the durable receipt', async () => {
  const baseConfig = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...baseConfig,
    integrations: {
      ...baseConfig.integrations,
      fmp: { configured: true, value: { apiKey: 'test-fmp-key' } },
    },
  })

  try {
    const result = await runClarezaRefreshWithReceipt({
      operation: 'market',
      identity: 'market-data',
      fingerprint: 'full',
      requestId: 'request-a',
      refresh: async (hooks) => {
        hooks.assertOwnership()
        hooks.providerStarted()
        hooks.providerSucceeded()
        hooks.localMutationStarted()
        return { total: 10, errors: 0 }
      },
    })

    expect(result).toEqual({ total: 10, errors: 0 })
    expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
      .toMatchObject({ status: 'completed', providerStatus: 'succeeded', result: { total: 10, errors: 0 } })
  } finally {
    resetRuntimeConfigForTests()
  }
})

test('rejects the same request ID when its fingerprint changes atomically', async () => {
  await executeClarezaRefreshReceipt(options('request-a', async (context) => {
    context.provider.begin()
    context.provider.success()
    return { total: 10, errors: 0 }
  }))

  const reused = await executeClarezaRefreshReceipt({
    ...options('request-a', async () => ({ total: 99, errors: 0 })),
    fingerprint: 'different-payload',
  })

  expect(reused).toEqual({ kind: 'request-id-reused' })
  expect(await ClarezaRefreshExecutionReceipt.countDocuments({})).toBe(1)
})

test('concurrent A/B requests have one active owner for the same identity and fingerprint', async () => {
  let started = 0
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => { release = resolve })

  const firstPromise = executeClarezaRefreshReceipt(options('request-a', async (context) => {
    started++
    context.provider.begin()
    await providerBarrier
    context.provider.success()
    return { total: 10, errors: 0 }
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

  const second = await executeClarezaRefreshReceipt(options('request-b', async () => ({ total: 99, errors: 0 })))
  release()
  const first = await firstPromise

  expect(second).toEqual({ kind: 'in-progress' })
  expect(first).toEqual({ kind: 'completed', result: { total: 10, errors: 0 } })
})

test('stale running receipt becomes indeterminate without reopening provider work', async () => {
  const now = new Date()
  await ClarezaRefreshExecutionReceipt.create({
    operation: 'market',
    identity: 'market-data',
    fingerprint: 'full',
    requestId: 'stale-request',
    ownerId: 'stale-owner',
    status: 'running',
    providerStatus: 'not-started',
    startedAt: new Date(now.getTime() - 10_000),
    leaseExpiresAt: new Date(now.getTime() - 1),
  })

  let called = false
  const result = await executeClarezaRefreshReceipt({
    ...options('new-request', async () => {
      called = true
      return { total: 1, errors: 0 }
    }),
    now: () => now,
  })

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(called).toBe(false)
  expect(await ClarezaRefreshExecutionReceipt.findOne({ identity: 'market-data' }).lean())
    .toMatchObject({ status: 'indeterminate', providerStatus: 'unknown' })
})

test('ownership loss is indeterminate and does not start provider work', async () => {
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  let providerStarted = false

  const firstPromise = executeClarezaRefreshReceipt({
    ...options('request-a', async (context) => {
      await barrier
      context.lease.assertOwnership()
      providerStarted = true
      context.provider.begin()
      context.provider.success()
      return { total: 10, errors: 0 }
    }),
    heartbeatMs: 5,
  })

  await new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      const receipt = await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean()
      if (receipt) {
        clearInterval(timer)
        await ClarezaRefreshExecutionReceipt.updateOne(
          { requestId: 'request-a' },
          { $set: { ownerId: 'recovered-owner' } },
        )
        resolve()
      }
    }, 5)
    timer.unref?.()
  })

  await new Promise((resolve) => setTimeout(resolve, 20))
  release()
  const result = await firstPromise

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(providerStarted).toBe(false)
})

test('provider success followed by receipt settlement failure becomes indeterminate', async () => {
  const originalFindOneAndUpdate = ClarezaRefreshExecutionReceipt.findOneAndUpdate.bind(ClarezaRefreshExecutionReceipt)
  const settlement = jest.spyOn(ClarezaRefreshExecutionReceipt, 'findOneAndUpdate')
  settlement.mockImplementation(((filter: unknown, update: unknown, queryOptions: unknown) => {
    const status = (update as { $set?: { status?: string } }).$set?.status
    if (status === 'completed') {
      return { exec: () => Promise.reject(new Error('receipt settlement failed')) } as never
    }
    return originalFindOneAndUpdate(filter as never, update as never, queryOptions as never)
  }) as never)

  try {
    const result = await executeClarezaRefreshReceipt(options('request-a', async (context) => {
      context.provider.begin()
      context.provider.success()
      return { total: 10, errors: 0 }
    }))

    expect(result).toEqual({ kind: 'indeterminate' })
    expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
      .toMatchObject({ status: 'indeterminate', providerStatus: 'succeeded' })
  } finally {
    settlement.mockRestore()
  }
})

test('provider-unavailable failure before provider start remains retryable', async () => {
  const first = await executeClarezaRefreshReceipt(options('request-a', async (context) => {
    context.provider.notAttempted()
    context.provider.retryableFailure()
    throw new IntegrationUnavailableError('fmp')
  })).catch((error: unknown) => error)

  expect(first).toBeInstanceOf(IntegrationUnavailableError)
  expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
    .toMatchObject({ status: 'failed', providerStatus: 'not-started' })

  const retry = await executeClarezaRefreshReceipt(options('request-b', async (context) => {
    context.provider.begin()
    context.provider.success()
    return { total: 10, errors: 0 }
  }))

  expect(retry.kind).toBe('completed')
})

test('provider read failure before local persistence remains retryable with a new request', async () => {
  await expect(executeClarezaRefreshReceipt(options('request-a', async (context) => {
    context.provider.begin()
    throw new Error('provider read failed')
  }))).rejects.toThrow('provider read failed')

  expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
    .toMatchObject({ status: 'failed', providerStatus: 'unknown' })

  const retry = await executeClarezaRefreshReceipt(options('request-b', async (context) => {
    context.provider.begin()
    context.provider.success()
    return { total: 10, errors: 0 }
  }))

  expect(retry).toEqual({ kind: 'completed', result: { total: 10, errors: 0 } })
})

test('local persistence failure is indeterminate and fences every retry', async () => {
  let calls = 0
  const first = await executeClarezaRefreshReceipt(options('request-a', async (context) => {
    calls++
    context.provider.begin()
    context.provider.success()
    context.localMutation.begin()
    throw new Error('local persistence failed')
  }))

  const retry = await executeClarezaRefreshReceipt(options('request-b', async () => {
    calls++
    return { total: 99, errors: 0 }
  }))

  expect(first).toEqual({ kind: 'indeterminate' })
  expect(retry).toEqual({ kind: 'indeterminate' })
  expect(calls).toBe(1)
  expect(await ClarezaRefreshExecutionReceipt.findOne({ requestId: 'request-a' }).lean())
    .toMatchObject({ status: 'indeterminate', providerStatus: 'succeeded' })
})
