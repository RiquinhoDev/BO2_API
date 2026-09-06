import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import GuruCurseducaInactivationReceipt from '../../../src/models/GuruCurseducaInactivationReceipt'
import {
  createGuruExternalInactivationService,
  curseducaInactivationTargetIdentity,
  type ExternalInactivationEnrollment,
  type GuruExternalInactivationRepository,
} from '../../../src/services/guru/guruExternalInactivation.service'
import type { CurseducaInactivationClient } from '../../../src/services/guru/curseducaInactivation.client'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_inactivation_receipt_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_inactivation_receipt_test')),
  )
  await GuruCurseducaInactivationReceipt.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await GuruCurseducaInactivationReceipt.deleteMany({})
})

const enrollment = (
  id: string,
  memberId: string | number = id,
  status?: string,
): ExternalInactivationEnrollment => ({
  id,
  userId: `user-${id}`,
  email: `${id}@example.test`,
  memberId,
  hasCurseducaUser: true,
  status,
})

const repository = (
  overrides: Partial<GuruExternalInactivationRepository> = {},
): GuruExternalInactivationRepository => ({
  findOne: jest.fn(async () => enrollment('product-1')),
  findMany: jest.fn(async () => [enrollment('product-1')]),
  markDuplicates: jest.fn(async () => undefined),
  claimInactivation: jest.fn(async () => true),
  releaseInactivationClaim: jest.fn(async () => undefined),
  markInactive: jest.fn(async () => undefined),
  recordFailure: jest.fn(async () => undefined),
  ...overrides,
})

const client = (
  inactivate: CurseducaInactivationClient['inactivate'],
): CurseducaInactivationClient => ({ inactivate })

test('single replay returns the durable canonical result after local INACTIVE short-circuit', async () => {
  const repo = repository({
    findOne: jest.fn()
      .mockResolvedValueOnce(enrollment('product-1'))
      .mockResolvedValueOnce(enrollment('product-1', 'product-1', 'INACTIVE')),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const first = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  const replay = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')

  expect(replay).toEqual(first)
  expect(replay).toMatchObject({ kind: 'success', memberId: 'product-1' })
  expect(inactivate).toHaveBeenCalledTimes(1)
  expect(repo.markInactive).toHaveBeenCalledTimes(1)
})

test('single concurrent A/B has one provider owner and retry A replays', async () => {
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => { release = resolve })
  const inactivate = jest.fn(async () => {
    await providerBarrier
    return { success: true as const, response: { ok: true } }
  })
  const service = createGuruExternalInactivationService(
    repository(),
    client(inactivate),
    { enabled: () => true },
  )

  const firstPromise = service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (inactivate.mock.calls.length > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })
  const second = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-b')
  release()
  const first = await firstPromise
  const retry = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')

  expect(second).toEqual({ kind: 'in-progress' })
  expect(retry).toEqual(first)
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('provider success followed by local persistence failure becomes indeterminate and blocks retry', async () => {
  const repo = repository({
    markInactive: jest.fn(async () => {
      throw new Error('UserProduct write failed after User write')
    }),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const first = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  const retry = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-b')

  expect(first).toEqual({ kind: 'indeterminate' })
  expect(retry).toEqual({ kind: 'indeterminate' })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('provider response without confirmed effect is indeterminate, not retryable', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({
    success: false as const,
    error: 'timeout after remote request',
    providerAttempted: true as const,
  }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const first = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  const retry = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-b')

  expect(first).toEqual({ kind: 'indeterminate' })
  expect(retry).toEqual({ kind: 'indeterminate' })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('single indeterminate target blocks a later bulk run for the same provider member', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [enrollment('product-1')]),
    markInactive: jest.fn(async () => {
      throw new Error('local write failed')
    }),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  expect(await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a'))
    .toEqual({ kind: 'indeterminate' })
  const bulk = await service.inactivateBulk({ userProductIds: ['product-1'] }, 'bulk-b')

  expect(bulk).toMatchObject({ processed: 1, succeeded: 0, failed: 1 })
  expect(bulk.details[0]).toMatchObject({
    success: false,
    error: 'Resultado da inativação ficou indeterminado; requer reconciliação',
  })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('single and bulk share one target fence for numeric/string member ids', async () => {
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => { release = resolve })
  const repo = repository({
    findOne: jest.fn(async () => enrollment('product-1', '123')),
    findMany: jest.fn(async () => [enrollment('product-duplicate', 123)]),
  })
  const inactivate = jest.fn(async () => {
    await providerBarrier
    return { success: true as const, response: { ok: true } }
  })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  const singlePromise = service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (inactivate.mock.calls.length > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })
  const bulk = await service.inactivateBulk(
    { userProductIds: ['product-duplicate'] },
    'bulk-b',
  )
  release()
  await singlePromise

  expect(curseducaInactivationTargetIdentity('123'))
    .toBe(curseducaInactivationTargetIdentity(123))
  expect(bulk).toMatchObject({ processed: 1, succeeded: 0, failed: 1 })
  expect(bulk.details[0]).toMatchObject({
    userProductId: 'product-duplicate',
    inProgress: true,
  })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('single request-id reuse across different targets is atomically rejected', async () => {
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => { release = resolve })
  const repo = repository({
    findOne: jest.fn(async (criteria) => criteria.userProductId === 'product-1'
      ? enrollment('product-1', '101')
      : enrollment('product-2', '102')),
  })
  const inactivate = jest.fn(async () => {
    await providerBarrier
    return { success: true as const, response: { ok: true } }
  })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const firstPromise = service.inactivateSingle({ userProductId: 'product-1' }, 'single-same')
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (inactivate.mock.calls.length > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })
  const second = await service.inactivateSingle({ userProductId: 'product-2' }, 'single-same')
  release()
  const first = await firstPromise

  expect(second).toEqual({ kind: 'request-id-reused' })
  expect(first).toMatchObject({ kind: 'success', memberId: '101' })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('stale receipt is fenced as indeterminate and never reopens provider work', async () => {
  const at = new Date('2026-09-06T10:00:00.000Z')
  const identity = curseducaInactivationTargetIdentity('product-1')
  await GuruCurseducaInactivationReceipt.create({
    operation: 'target',
    identity,
    requestId: 'single-a',
    ownerId: 'owner-a',
    status: 'running',
    providerStatus: 'unknown',
    startedAt: new Date(at.getTime() - 60_000),
    leaseExpiresAt: new Date(at.getTime() - 1),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repository(), client(inactivate), {
    enabled: () => true,
    now: () => at,
  })

  const result = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-b')
  const receipt = await GuruCurseducaInactivationReceipt.findOne({ identity }).lean()

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(inactivate).not.toHaveBeenCalled()
  expect(receipt).toMatchObject({ status: 'indeterminate', providerStatus: 'unknown' })
})

test('bulk replay returns canonical results before all-mode read and rejects request-id payload reuse', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [enrollment('product-1')]),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  const first = await service.inactivateBulk({ all: true }, 'bulk-a')
  const replay = await service.inactivateBulk({ all: true }, 'bulk-a')
  const changedPayload = await service.inactivateBulk({ userProductIds: ['product-2'] }, 'bulk-a')

  expect(replay).toEqual(first)
  expect(changedPayload).toEqual({ kind: 'request-id-reused' })
  expect(repo.findMany).toHaveBeenCalledTimes(1)
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('bulk request-id uniqueness is atomic for concurrent different fingerprints', async () => {
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => { release = resolve })
  const repo = repository({
    findMany: jest.fn(async (criteria) => [
      enrollment(criteria.userProductIds?.[0] ?? 'product-1'),
    ]),
  })
  const inactivate = jest.fn(async () => {
    await providerBarrier
    return { success: true as const, response: { ok: true } }
  })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  const firstPromise = service.inactivateBulk({ userProductIds: ['product-1'] }, 'bulk-same')
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (inactivate.mock.calls.length > 0) {
        clearInterval(timer)
        resolve()
      }
    }, 5)
    timer.unref?.()
  })
  const secondPromise = service.inactivateBulk({ userProductIds: ['product-2'] }, 'bulk-same')
  const second = await secondPromise
  release()
  const first = await firstPromise

  expect(second).toEqual({ kind: 'request-id-reused' })
  expect(first).toMatchObject({ processed: 1, succeeded: 1 })
  expect(inactivate).toHaveBeenCalledTimes(1)
})

test('receipt settlement failure after provider success returns indeterminate', async () => {
  const originalFindOneAndUpdate = GuruCurseducaInactivationReceipt.findOneAndUpdate.bind(
    GuruCurseducaInactivationReceipt,
  )
  const update = jest.spyOn(GuruCurseducaInactivationReceipt, 'findOneAndUpdate')
    .mockImplementation((...args: any[]) => {
      const mutation = args[1] as { $set?: { status?: string } }
      if (mutation.$set?.status === 'completed') {
        return Promise.reject(new Error('receipt persistence unavailable')) as any
      }
      return originalFindOneAndUpdate(...args) as any
    })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repository(), client(inactivate), {
    enabled: () => true,
  })

  const result = await service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')

  expect(result).toEqual({ kind: 'indeterminate' })
  expect(inactivate).toHaveBeenCalledTimes(1)
  update.mockRestore()
})

test('receipt ownership loss during the local claim fences the provider before its attempt', async () => {
  let releaseClaim!: () => void
  let claimStarted!: () => void
  const claimStartedPromise = new Promise<void>((resolve) => { claimStarted = resolve })
  const claimGate = new Promise<void>((resolve) => { releaseClaim = resolve })
  const repo = repository({
    claimInactivation: jest.fn(async () => {
      claimStarted()
      await claimGate
      return true
    }),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    receiptHeartbeatMs: 1,
    now: () => new Date('2026-09-06T10:00:00.000Z'),
  })

  const executionPromise = service.inactivateSingle({ userProductId: 'product-1' }, 'single-a')
  await claimStartedPromise
  await GuruCurseducaInactivationReceipt.deleteOne({ requestId: 'single-a' })
  await new Promise<void>((resolve) => setTimeout(resolve, 30))
  releaseClaim()

  await expect(executionPromise).resolves.toEqual({ kind: 'indeterminate' })
  expect(inactivate).not.toHaveBeenCalled()
})

test('bulk keeps per-item continue-on-error while replaying the stored result once', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [enrollment('product-1'), enrollment('product-2')]),
  })
  const inactivate = jest.fn()
    .mockResolvedValueOnce({ success: false as const, error: 'remote failure' })
    .mockResolvedValueOnce({ success: true as const, response: { ok: true } })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  const first = await service.inactivateBulk({ userProductIds: ['product-2', 'product-1'] }, 'bulk-a')
  const replay = await service.inactivateBulk({ userProductIds: ['product-1', 'product-2'] }, 'bulk-a')

  expect(first).toMatchObject({ processed: 2, succeeded: 1, failed: 1 })
  expect(replay).toEqual(first)
  expect(repo.findMany).toHaveBeenCalledTimes(1)
  expect(inactivate).toHaveBeenCalledTimes(2)
})
