import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import CronExecution from '../../../src/models/cron/CronExecution'
import CronJobConfig from '../../../src/models/SyncModels/CronJobConfig'
import { mongooseCronTagsRepository } from '../../../src/services/cron/mongooseCronTags.repository'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'cron_tags_repository_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('cron_tags_repository_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    CronExecution.deleteMany({}),
    CronJobConfig.deleteMany({}),
  ])
})

test('maps the complete canonical job contract', async () => {
  const createdBy = new mongoose.Types.ObjectId()
  await CronJobConfig.create({
    name: 'TAG_RULES_SYNC',
    description: 'Tag rules',
    syncType: 'pipeline',
    schedule: {
      cronExpression: '0 2 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    syncConfig: {
      fullSync: true,
      includeProgress: true,
      includeTags: true,
      batchSize: 100,
    },
    tagRules: [],
    tagRuleOptions: {
      enabled: true,
      executeAllRules: true,
      runInParallel: false,
      stopOnError: false,
    },
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: true,
      recipients: [],
    },
    retryPolicy: {
      maxRetries: 3,
      retryDelayMinutes: 30,
      exponentialBackoff: true,
    },
    createdBy,
    isActive: true,
    totalRuns: 4,
    successfulRuns: 3,
    failedRuns: 1,
  })

  const job = await mongooseCronTagsRepository.findJobByName('TAG_RULES_SYNC')

  expect(job).toMatchObject({
    name: 'TAG_RULES_SYNC',
    description: 'Tag rules',
    syncType: 'pipeline',
    schedule: {
      cronExpression: '0 2 * * *',
      timezone: 'Europe/Lisbon',
      enabled: true,
    },
    syncConfig: {
      fullSync: true,
      includeProgress: true,
      includeTags: true,
      batchSize: 100,
    },
    createdBy: createdBy.toString(),
    totalRuns: 4,
    successfulRuns: 3,
    failedRuns: 1,
  })
})

test('returns execution history with stable ordering and a hard limit', async () => {
  const sameStart = new Date('2026-07-29T02:00:00.000Z')
  const ids = [
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012',
    '507f1f77bcf86cd799439013',
  ]
  await CronExecution.insertMany(
    ids.map(id => ({
      _id: id,
      cronName: 'TAG_RULES_SYNC',
      executionType: 'automatic',
      status: 'success',
      startTime: sameStart,
    })),
  )

  const history = await mongooseCronTagsRepository.listExecutions({
    cronName: 'TAG_RULES_SYNC',
    limit: 2,
  })

  expect(history.map(execution => execution._id)).toEqual([
    '507f1f77bcf86cd799439013',
    '507f1f77bcf86cd799439012',
  ])
})

test('aggregates statistics in Mongo without materializing execution history', async () => {
  const since = new Date('2026-06-29T12:00:00.000Z')
  await CronExecution.insertMany([
    {
      cronName: 'TAG_RULES_SYNC',
      executionType: 'automatic',
      status: 'success',
      startTime: new Date('2026-07-01T00:00:00.000Z'),
      duration: 1000,
    },
    {
      cronName: 'TAG_RULES_SYNC',
      executionType: 'automatic',
      status: 'error',
      startTime: new Date('2026-07-02T00:00:00.000Z'),
      duration: 3000,
    },
    {
      cronName: 'TAG_RULES_SYNC',
      executionType: 'automatic',
      status: 'running',
      startTime: new Date('2026-07-03T00:00:00.000Z'),
    },
    {
      cronName: 'TAG_RULES_SYNC',
      executionType: 'automatic',
      status: 'success',
      startTime: new Date('2026-01-01T00:00:00.000Z'),
      duration: 9000,
    },
  ])

  await expect(mongooseCronTagsRepository.getStatistics({
    cronName: 'TAG_RULES_SYNC',
    since,
  })).resolves.toEqual({
    totalExecutions: 3,
    successRate: 50,
    avgDuration: 2000,
  })
})
