import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import ActiveCampaignExecution from '../../../src/models/ActiveCampaignExecution'
import {
  ACTIVE_CAMPAIGN_EXECUTION_HEARTBEAT_MS,
  ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS,
  claimActiveCampaignExecution,
  completeActiveCampaignExecution,
  failActiveCampaignExecution,
  startActiveCampaignExecutionLease,
} from '../../../src/services/activeCampaign/activeCampaignExecution.service'
import { ActiveCampaignTransport } from '../../../src/services/activeCampaign/activeCampaignTransport'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'active_campaign_execution_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(
    mongoServer.getUri('active_campaign_execution_test'),
  ))
  await ActiveCampaignExecution.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ActiveCampaignExecution.deleteMany({})
})

test('preserves completed receipts across a later request and replays the first one', async () => {
  const first = await claimActiveCampaignExecution('test-cron', 'request-a')
  expect(first.kind).toBe('claimed')
  if (first.kind !== 'claimed') throw new Error('first request was not claimed')
  const firstResult = { requestId: 'request-a', status: 'completed' }
  await completeActiveCampaignExecution('test-cron', first.ownerId, firstResult)

  const second = await claimActiveCampaignExecution('test-cron', 'request-b')
  expect(second.kind).toBe('claimed')
  if (second.kind !== 'claimed') throw new Error('second request was not claimed')
  await completeActiveCampaignExecution('test-cron', second.ownerId, {
    requestId: 'request-b',
    status: 'completed',
  })

  await expect(claimActiveCampaignExecution('test-cron', 'request-a')).resolves.toEqual({
    kind: 'replay',
    result: firstResult,
  })
  expect(await ActiveCampaignExecution.countDocuments({ operation: 'test-cron' })).toBe(2)
})

test('enforces one running operation and keeps a recovered receipt history', async () => {
  const [first, second] = await Promise.all([
    claimActiveCampaignExecution('tag-rules-only', 'request-a'),
    claimActiveCampaignExecution('tag-rules-only', 'request-b'),
  ])
  expect([first.kind, second.kind].sort()).toEqual(['claimed', 'in-progress'])
  const running = first.kind === 'claimed' ? first : second
  if (running.kind !== 'claimed') throw new Error('no running claim was returned')
  await ActiveCampaignExecution.updateOne(
    { operation: 'tag-rules-only', ownerId: running.ownerId },
    { $set: { leaseExpiresAt: new Date(0) } },
  )

  const recovered = await claimActiveCampaignExecution('tag-rules-only', 'request-c')
  expect(recovered.kind).toBe('claimed')
  expect(await ActiveCampaignExecution.countDocuments({ operation: 'tag-rules-only' })).toBe(2)
  expect(await ActiveCampaignExecution.countDocuments({ operation: 'tag-rules-only', status: 'running' })).toBe(1)
})

test('completion and failure reject a lost owner instead of reporting a persisted transition', async () => {
  await expect(completeActiveCampaignExecution('test-cron', 'missing-owner', { ok: true }))
    .rejects.toMatchObject({ code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_OWNERSHIP_LOST' })
  await expect(failActiveCampaignExecution('test-cron', 'missing-owner'))
    .rejects.toMatchObject({ code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_OWNERSHIP_LOST' })
})

test('declares composite receipt and partial running indexes', () => {
  const indexes = ActiveCampaignExecution.schema.indexes()
  expect(indexes).toContainEqual([
    { operation: 1, requestId: 1 },
    expect.objectContaining({ unique: true }),
  ])
  expect(indexes).toContainEqual([
    { operation: 1 },
    expect.objectContaining({
      unique: true,
      partialFilterExpression: { status: 'running' },
    }),
  ])
})

test('reclaims an expired lease even while the original process remains alive', async () => {
  const startedAt = new Date('2026-09-06T09:00:00.000Z')
  const first = await claimActiveCampaignExecution('test-cron', 'request-a', startedAt)
  expect(first.kind).toBe('claimed')
  if (first.kind !== 'claimed') throw new Error('first request was not claimed')

  const expiredAt = new Date(startedAt.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS + 1)
  await expect(claimActiveCampaignExecution('test-cron', 'request-b', expiredAt))
    .resolves.toEqual({ kind: 'claimed', ownerId: expect.any(String) })
  expect(await ActiveCampaignExecution.countDocuments({ operation: 'test-cron', status: 'failed' })).toBe(1)
  expect(await ActiveCampaignExecution.countDocuments({ operation: 'test-cron', status: 'running' })).toBe(1)
})

test('heartbeat renews a live owner before the original lease can be reclaimed', async () => {
  let now = new Date('2026-09-06T10:00:00.000Z')
  const first = await claimActiveCampaignExecution('test-cron', 'request-a', now)
  expect(first.kind).toBe('claimed')
  if (first.kind !== 'claimed') throw new Error('first request was not claimed')

  const lease = startActiveCampaignExecutionLease('test-cron', first.ownerId, {
    intervalMs: ACTIVE_CAMPAIGN_EXECUTION_HEARTBEAT_MS,
    now: () => now,
  })
  try {
    now = new Date(now.getTime() + ACTIVE_CAMPAIGN_EXECUTION_LEASE_MS - 1)
    await lease.renew()
    now = new Date(now.getTime() + 2)

    await expect(claimActiveCampaignExecution('test-cron', 'request-b', now))
      .resolves.toEqual({ kind: 'in-progress' })
  } finally {
    lease.stop()
  }
})

test('a lost heartbeat prevents a new ActiveCampaign provider unit and fails the run closed', async () => {
  const now = new Date('2026-09-06T11:00:00.000Z')
  const first = await claimActiveCampaignExecution('test-cron', 'request-a', now)
  expect(first.kind).toBe('claimed')
  if (first.kind !== 'claimed') throw new Error('first request was not claimed')

  const lease = startActiveCampaignExecutionLease('test-cron', first.ownerId, {
    intervalMs: ACTIVE_CAMPAIGN_EXECUTION_HEARTBEAT_MS,
    now: () => now,
  })
  const transport = new ActiveCampaignTransport({
    readIntegration: () => ({
      apiUrl: 'https://activecampaign.example.test',
      apiKey: 'test-key',
      webhookSecret: 'test-webhook-secret',
      debugEnabled: false,
      verifyDeleteEnabled: false,
      lists: {},
    }),
  })
  let providerCalls = 0

  try {
    await expect(lease.run(async () => {
      await transport.retryRequest(async () => {
        providerCalls += 1
        return 'first-provider-unit'
      })
      await ActiveCampaignExecution.updateOne(
        { operation: 'test-cron', ownerId: first.ownerId },
        { $set: { status: 'failed' } },
      )
      await lease.renew()
      await transport.retryRequest(async () => {
        providerCalls += 1
        return 'must-not-start'
      })
    })).rejects.toMatchObject({ code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_OWNERSHIP_LOST' })
  } finally {
    lease.stop()
  }
  expect(providerCalls).toBe(1)
})
