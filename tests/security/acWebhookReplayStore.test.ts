import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import AcWebhookReceipt from '../../src/models/AcWebhookReceipt'
import { createMongoAcWebhookReplayStore } from '../../src/security/acWebhookSecurity'

const minuteMs = 60 * 1000
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'ac_webhook_replay_store_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(
    mongoServer.getUri('ac_webhook_replay_store_test'),
  ))
  await AcWebhookReceipt.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await AcWebhookReceipt.deleteMany({})
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('reclaims a processing receipt whose lease expired', async () => {
  const fingerprint = 'stale-processing'
  const staleReceivedAt = new Date(Date.now() - 11 * minuteMs)
  await AcWebhookReceipt.create({
    fingerprint,
    status: 'processing',
    claimToken: 'expired-owner',
    receivedAt: staleReceivedAt,
    leaseExpiresAt: new Date(Date.now() - minuteMs),
  })

  const claimed = await createMongoAcWebhookReplayStore().claim(fingerprint)

  expect(claimed).toBeTruthy()
  const receipt = await AcWebhookReceipt.findOne({ fingerprint }).lean()
  expect(receipt?.status).toBe('processing')
  expect(receipt?.receivedAt).toEqual(staleReceivedAt)
  expect(receipt?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now())
})

test('does not reclaim a live lease or any processed receipt', async () => {
  await AcWebhookReceipt.create([
    {
      fingerprint: 'live-processing',
      status: 'processing',
      receivedAt: new Date(Date.now() - minuteMs),
    },
    {
      fingerprint: 'legacy-stale-processing',
      status: 'processing',
      receivedAt: new Date(Date.now() - 60 * minuteMs),
    },
    {
      fingerprint: 'live-explicit-lease',
      status: 'processing',
      receivedAt: new Date(Date.now() - 60 * minuteMs),
      leaseExpiresAt: new Date(Date.now() + minuteMs),
    },
    {
      fingerprint: 'processed',
      status: 'processed',
      receivedAt: new Date(Date.now() - 60 * minuteMs),
      processedAt: new Date(Date.now() - 59 * minuteMs),
    },
    {
      fingerprint: 'processed-expired-lease',
      status: 'processed',
      receivedAt: new Date(Date.now() - 60 * minuteMs),
      leaseExpiresAt: new Date(Date.now() - minuteMs),
      processedAt: new Date(Date.now() - 59 * minuteMs),
    },
  ])
  const store = createMongoAcWebhookReplayStore()

  await expect(store.claim('live-processing')).resolves.toBeFalsy()
  await expect(store.claim('legacy-stale-processing')).resolves.toBeFalsy()
  await expect(store.claim('live-explicit-lease')).resolves.toBeFalsy()
  await expect(store.claim('processed')).resolves.toBeFalsy()
  await expect(store.claim('processed-expired-lease')).resolves.toBeFalsy()
})

test('allows only one concurrent claimant to recover a stale receipt', async () => {
  const fingerprint = 'concurrent-stale-processing'
  await AcWebhookReceipt.create({
    fingerprint,
    status: 'processing',
    claimToken: 'expired-owner',
    receivedAt: new Date(Date.now() - 11 * minuteMs),
    leaseExpiresAt: new Date(Date.now() - minuteMs),
  })
  const store = createMongoAcWebhookReplayStore()

  const claims = await Promise.all([
    store.claim(fingerprint),
    store.claim(fingerprint),
  ])

  expect(claims.filter(Boolean)).toHaveLength(1)
})

test('allows only one concurrent claimant to create a new receipt', async () => {
  const store = createMongoAcWebhookReplayStore()

  const claims = await Promise.all([
    store.claim('concurrent-new-receipt'),
    store.claim('concurrent-new-receipt'),
  ])

  expect(claims.filter(Boolean)).toHaveLength(1)
  expect(await AcWebhookReceipt.countDocuments({
    fingerprint: 'concurrent-new-receipt',
  })).toBe(1)
})

test('creates a new claim when the previous owner releases during recovery', async () => {
  const fingerprint = 'release-during-recovery'
  await AcWebhookReceipt.create({
    fingerprint,
    status: 'processing',
    claimToken: 'previous-owner',
    receivedAt: new Date(Date.now() - 11 * minuteMs),
    leaseExpiresAt: new Date(Date.now() - minuteMs),
  })
  const store = createMongoAcWebhookReplayStore()
  const findOneAndUpdate = AcWebhookReceipt.findOneAndUpdate.bind(AcWebhookReceipt)
  jest.spyOn(AcWebhookReceipt, 'findOneAndUpdate').mockImplementationOnce((async (
    filter: unknown,
    update: unknown,
    options: unknown,
  ) => {
    await store.release(fingerprint, { token: 'previous-owner' })
    return Reflect.apply(findOneAndUpdate, AcWebhookReceipt, [filter, update, options])
  }) as never)

  const claimed = await store.claim(fingerprint)

  expect(claimed).toEqual({ token: expect.any(String) })
  expect(await AcWebhookReceipt.countDocuments({ fingerprint })).toBe(1)
})

test('propagates database failures that are not duplicate-key conflicts', async () => {
  const failure = new Error('database unavailable')
  jest.spyOn(AcWebhookReceipt, 'create').mockRejectedValueOnce(failure)

  await expect(
    createMongoAcWebhookReplayStore().claim('database-failure'),
  ).rejects.toBe(failure)
})

test('prevents the previous lease owner from releasing or completing a recovered receipt', async () => {
  const fingerprint = 'owned-stale-processing'
  await AcWebhookReceipt.collection.insertOne({
    fingerprint,
    status: 'processing',
    claimToken: 'previous-owner',
    receivedAt: new Date(Date.now() - 11 * minuteMs),
    leaseExpiresAt: new Date(Date.now() - minuteMs),
    expiresAt: new Date(Date.now() + 24 * 60 * minuteMs),
  })
  const store = createMongoAcWebhookReplayStore()

  const recovered = await store.claim(fingerprint)
  expect(recovered).toEqual({ token: expect.any(String) })
  const currentClaim = recovered as unknown as { token: string }
  const release = Reflect.get(store, 'release') as (
    fingerprint: string,
    claim: { token: string },
  ) => Promise<void>
  const complete = Reflect.get(store, 'complete') as (
    fingerprint: string,
    claim: { token: string },
  ) => Promise<void>

  await release(fingerprint, { token: 'previous-owner' })
  await complete(fingerprint, { token: 'previous-owner' })

  expect(await AcWebhookReceipt.collection.findOne({ fingerprint })).toEqual(
    expect.objectContaining({
      status: 'processing',
      claimToken: currentClaim.token,
    }),
  )

  await complete(fingerprint, currentClaim)
  expect(await AcWebhookReceipt.collection.findOne({ fingerprint })).toEqual(
    expect.objectContaining({
      status: 'processed',
      claimToken: currentClaim.token,
    }),
  )
})
