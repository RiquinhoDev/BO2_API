import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import CronJobConfig from '../../src/models/SyncModels/CronJobConfig'
import type { CronSeedDefinition } from '../../src/runtime/cronSeeds'
import { mongooseCronSeedRepository } from '../../src/runtime/mongooseCronSeed.repository'

const clarezaSeed: CronSeedDefinition = {
  name: 'ClarezaRefresh',
  description: 'Atualiza dados Clareza',
  syncType: 'clareza',
  schedule: {
    cronExpression: '0 6,12,18 * * *',
    timezone: 'Europe/Lisbon',
    enabled: true,
  },
  syncConfig: {
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 200,
  },
  tagRules: [],
  tagRuleOptions: {
    enabled: false,
    executeAllRules: false,
    runInParallel: false,
    stopOnError: false,
  },
  notifications: {
    enabled: false,
    emailOnSuccess: false,
    emailOnFailure: false,
    recipients: [],
  },
  retryPolicy: {
    maxRetries: 2,
    retryDelayMinutes: 30,
    exponentialBackoff: false,
  },
}

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'cron_seed_repository_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('cron_seed_repository_test'),
    ),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await CronJobConfig.deleteMany({})
})

test('creates a complete canonical cron seed with its system audit owner', async () => {
  await mongooseCronSeedRepository.create(clarezaSeed)

  const job = await CronJobConfig.findOne({ name: 'ClarezaRefresh' }).lean()
  expect(job).toMatchObject({
    name: 'ClarezaRefresh',
    syncType: 'clareza',
    schedule: {
      cronExpression: '0 6,12,18 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    createdBy: new mongoose.Types.ObjectId('000000000000000000000001'),
    isActive: true,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
  })
})

test('repairs only requested schedule fields and a missing audit owner', async () => {
  await CronJobConfig.collection.insertOne({
    ...clarezaSeed,
    schedule: {
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
      enabled: true,
    },
    createdBy: null,
    nextRun: new Date(),
    isActive: true,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
  })

  await mongooseCronSeedRepository.update('ClarezaRefresh', {
    cronExpression: '0 6,12,18 * * *',
    timezone: 'Europe/Lisbon',
    ensureCreatedBy: true,
  })

  const job = await CronJobConfig.findOne({ name: 'ClarezaRefresh' }).lean()
  expect(job?.schedule).toMatchObject({
    cronExpression: '0 6,12,18 * * *',
    timezone: 'Europe/Lisbon',
    enabled: true,
  })
  expect(job?.createdBy).toEqual(
    new mongoose.Types.ObjectId('000000000000000000000001'),
  )
})
