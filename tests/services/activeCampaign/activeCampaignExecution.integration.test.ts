import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import ActiveCampaignExecution from '../../../src/models/ActiveCampaignExecution'
import {
  claimActiveCampaignExecution,
  completeActiveCampaignExecution,
  failActiveCampaignExecution,
} from '../../../src/services/activeCampaign/activeCampaignExecution.service'
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
