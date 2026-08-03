import { type Collection, type Db, type Document, MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import {
  MongoAcWebhookLeaseCatalog,
  backfillAcWebhookReceiptLeases,
  readAcWebhookLeaseBackfillCliConfig,
} from '../../../src/scripts/maintenance/backfill-ac-webhook-receipt-leases'

let mongoServer: MongoMemoryServer
let client: MongoClient
let database: Db
let collection: Collection<Document>
const now = new Date('2026-08-03T12:00:00.000Z')

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'ac_webhook_lease_backfill_test' },
  })
  client = new MongoClient(assertSafeTestMongoUri(
    mongoServer.getUri('ac_webhook_lease_backfill_test'),
  ))
  await client.connect()
  database = client.db()
})

afterAll(async () => {
  await client.close()
  await mongoServer.stop()
})

beforeEach(async () => {
  collection = database.collection('ac_webhook_receipts')
  await collection.deleteMany({})
  await collection.insertMany([
    { fingerprint: 'legacy', status: 'processing', receivedAt: new Date(0) },
    {
      fingerprint: 'leased',
      status: 'processing',
      receivedAt: new Date(0),
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    },
    { fingerprint: 'processed', status: 'processed', receivedAt: new Date(0) },
  ])
})

test('inspects legacy processing receipts without mutating by default', async () => {
  await expect(backfillAcWebhookReceiptLeases(
    new MongoAcWebhookLeaseCatalog(collection),
    { apply: false, workersDrained: false, now },
  )).resolves.toEqual({
    status: 'pending',
    legacyProcessing: 1,
    mutated: 0,
  })
  expect(await collection.findOne({ fingerprint: 'legacy' }))
    .not.toHaveProperty('leaseExpiresAt')
})

test('fails closed when apply is requested before old workers are drained', async () => {
  await expect(backfillAcWebhookReceiptLeases(
    new MongoAcWebhookLeaseCatalog(collection),
    { apply: true, workersDrained: false, now },
  )).rejects.toThrow('old webhook workers must be drained')
  expect(await collection.findOne({ fingerprint: 'legacy' }))
    .not.toHaveProperty('leaseExpiresAt')
})

test('backfills only legacy processing receipts and verifies idempotently', async () => {
  const catalog = new MongoAcWebhookLeaseCatalog(collection)

  await expect(backfillAcWebhookReceiptLeases(catalog, {
    apply: true,
    workersDrained: true,
    now,
  })).resolves.toEqual({
    status: 'applied',
    legacyProcessing: 0,
    mutated: 1,
  })
  expect(await collection.findOne({ fingerprint: 'legacy' }))
    .toEqual(expect.objectContaining({ leaseExpiresAt: now }))
  expect(await collection.findOne({ fingerprint: 'leased' }))
    .toEqual(expect.objectContaining({
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    }))
  expect(await collection.findOne({ fingerprint: 'processed' }))
    .not.toHaveProperty('leaseExpiresAt')

  await expect(backfillAcWebhookReceiptLeases(catalog, {
    apply: true,
    workersDrained: true,
    now,
  })).resolves.toEqual({
    status: 'verified',
    legacyProcessing: 0,
    mutated: 0,
  })
})

test('requires explicit boolean flags and a Mongo URI', () => {
  expect(() => readAcWebhookLeaseBackfillCliConfig({})).toThrow(
    'MONGO_URI is required',
  )
  expect(() => readAcWebhookLeaseBackfillCliConfig({
    MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    AC_WEBHOOK_LEASE_BACKFILL_APPLY: 'yes',
  })).toThrow('AC_WEBHOOK_LEASE_BACKFILL_APPLY must be true or false')
  expect(readAcWebhookLeaseBackfillCliConfig({
    MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    AC_WEBHOOK_LEASE_BACKFILL_APPLY: 'true',
    AC_WEBHOOK_LEGACY_WORKERS_DRAINED: 'true',
  })).toEqual({
    mongoUri: 'mongodb://127.0.0.1:27017/test',
    apply: true,
    workersDrained: true,
  })
})
