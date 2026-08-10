import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import SyncHistory from '../../../src/models/SyncHistory'
import { MongooseDiscordIdentityImportHistoryRepository } from '../../../src/services/users/mongooseDiscordIdentityImportHistory.repository'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'discord_identity_import_history_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('discord_identity_import_history_test'),
    ),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await SyncHistory.collection.deleteMany({})
})

test('persists the authenticated import owner and completion statistics', async () => {
  const repository = new MongooseDiscordIdentityImportHistoryRepository()
  const completedAt = new Date('2026-07-29T15:00:00.000Z')

  const syncId = await repository.start({
    actorEmail: 'admin@example.test',
    originalName: 'identities.csv',
  })
  await repository.complete({
    syncId,
    completedAt,
    stats: { total: 7, added: 3, errors: 1 },
  })

  const history = await SyncHistory.findById(syncId).lean()
  expect(history).toMatchObject({
    type: 'csv',
    status: 'completed',
    user: 'admin@example.test',
    metadata: { fileName: 'identities.csv' },
    completedAt,
    stats: {
      total: 7,
      added: 3,
      updated: 0,
      conflicts: 0,
      errors: 1,
    },
  })
})

test('marks a started import as failed', async () => {
  const repository = new MongooseDiscordIdentityImportHistoryRepository()
  const completedAt = new Date('2026-07-29T16:00:00.000Z')
  const syncId = await repository.start({
    actorEmail: 'admin@example.test',
    originalName: 'broken.xlsx',
  })

  await repository.fail({ syncId, completedAt })

  await expect(
    SyncHistory.findById(syncId).lean(),
  ).resolves.toMatchObject({
    status: 'failed',
    completedAt,
  })
})
