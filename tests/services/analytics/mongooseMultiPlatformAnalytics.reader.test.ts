import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import { MongooseMultiPlatformAnalyticsReader } from '../../../src/services/analytics/mongooseMultiPlatformAnalytics.reader'
import { MultiPlatformAnalyticsService } from '../../../src/services/analytics/multiPlatformAnalytics.service'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'multi_platform_analytics_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('multi_platform_analytics_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
})

describe('MongooseMultiPlatformAnalyticsReader', () => {
  it('aggregates canonical and legacy platform data in one bounded query', async () => {
    await User.collection.insertMany([
      {
        email: 'canonical-hotmart@example.test',
        name: 'Canonical Hotmart',
        combined: { status: 'ACTIVE' },
        hotmart: { hotmartUserId: 'hotmart-1', engagement: { engagementScore: 80 } },
      },
      {
        email: 'legacy-hotmart@example.test',
        name: 'Legacy Hotmart',
        status: 'ACTIVE',
        hotmartUserId: 'legacy-hotmart-1',
        engagement: 50,
      },
      {
        email: 'canonical-curseduca@example.test',
        name: 'Canonical CursEduca',
        status: 'ativo',
        curseduca: { curseducaUserId: 'curseduca-1', engagement: { alternativeEngagement: 70 } },
      },
      {
        email: 'legacy-curseduca@example.test',
        name: 'Legacy CursEduca',
        curseducaUserId: 'legacy-curseduca-1',
        curseduca: { engagement: { alternativeEngagement: -20 } },
      },
      {
        email: 'canonical-discord-two-platforms@example.test',
        name: 'Canonical Discord Two Platforms',
        hotmart: { hotmartUserId: 'hotmart-2', engagement: { engagementScore: 40 } },
        discord: { discordIds: ['discord-canonical'], isDeleted: false },
      },
      {
        email: 'legacy-discord-three-platforms@example.test',
        name: 'Legacy Discord Three Platforms',
        combined: { status: 'ACTIVE' },
        hotmart: { hotmartUserId: 'hotmart-3', engagement: { engagementScore: 90 } },
        curseduca: { curseducaUserId: 'curseduca-2', engagement: { alternativeEngagement: 30 } },
        discordIds: ['discord-legacy'],
      },
      {
        email: 'canonical-discord-only@example.test',
        name: 'Canonical Discord Only',
        discord: { discordIds: ['discord-canonical-only'], isDeleted: false },
      },
      {
        email: 'legacy-discord-only@example.test',
        name: 'Legacy Discord Only',
        discordIds: ['discord-legacy-only'],
      },
      {
        email: 'zero-score@example.test',
        name: 'Zero Score',
        hotmart: { hotmartUserId: 'hotmart-zero', engagement: { engagementScore: 0 } },
      },
      {
        email: 'negative-score@example.test',
        name: 'Negative Score',
        hotmart: { hotmartUserId: 'hotmart-negative', engagement: { engagementScore: -10 } },
      },
      {
        email: 'string-score@example.test',
        name: 'String Score',
        curseduca: { curseducaUserId: 'curseduca-string', engagement: { alternativeEngagement: '99' } },
      },
      {
        email: 'object-score@example.test',
        name: 'Object Score',
        curseduca: { curseducaUserId: 'curseduca-object', engagement: { alternativeEngagement: { value: 99 } } },
      },
      { email: 'nan-score@example.test', name: 'NaN Score', engagement: Number.NaN },
      { email: 'infinity-score@example.test', name: 'Infinity Score', engagement: Number.POSITIVE_INFINITY },
      { email: 'negative-infinity-score@example.test', name: 'Negative Infinity Score', engagement: Number.NEGATIVE_INFINITY },
      { email: 'legacy-score@example.test', name: 'Legacy Score', engagement: 25 },
      {
        email: 'empty-identifiers@example.test',
        name: 'Empty Identifiers',
        hotmart: { hotmartUserId: '' },
        curseduca: { curseducaUserId: '' },
        discord: { discordIds: [] },
        hotmartUserId: '',
        curseducaUserId: '',
        discordIds: [],
      },
      {
        email: 'top-level-deleted@example.test',
        name: 'Top Level Deleted',
        isDeleted: true,
        hotmart: { hotmartUserId: 'deleted-hotmart', engagement: { engagementScore: 99 } },
      },
      {
        email: 'discord-deleted@example.test',
        name: 'Discord Deleted',
        discord: { isDeleted: true },
        curseduca: { curseducaUserId: 'deleted-curseduca', engagement: { alternativeEngagement: 99 } },
      },
    ])
    const aggregate = jest.spyOn(User, 'aggregate')
    const find = jest.spyOn(User, 'find')
    const countDocuments = jest.spyOn(User, 'countDocuments')
    const reader = new MongooseMultiPlatformAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      totalUsers: 17,
      activeUsers: 4,
      hotmartUsers: 6,
      curseducaUsers: 5,
      discordUsers: 4,
      multiPlatformUsers: 2,
      engagement: {
        hotmart: { total: 4, sum: 200 },
        curseduca: { total: 3, sum: 80 },
        combined: { total: 6, sum: 355 },
      },
    })
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(find).not.toHaveBeenCalled()
    expect(countDocuments).not.toHaveBeenCalled()
    expect(aggregate.mock.calls[0]?.[0]?.[0]).toMatchObject({
      $match: {
        isDeleted: { $ne: true },
        'discord.isDeleted': { $ne: true },
      },
    })
  })

  it('normalizes raw BSON scores to finite primitive sums without changing combined precedence', async () => {
    const unsafeLongAsDouble = 9_007_199_254_740_992
    await User.collection.insertOne({
      email: 'bson-scores@example.test',
      name: 'BSON Scores',
      hotmart: {
        hotmartUserId: 'hotmart-bson',
        engagement: {
          engagementScore: mongoose.mongo.Decimal128.fromString('12.5'),
        },
      },
      curseduca: {
        curseducaUserId: 'curseduca-bson',
        engagement: {
          alternativeEngagement:
            mongoose.mongo.Long.fromString('9007199254740993'),
        },
      },
    })
    const reader = new MongooseMultiPlatformAnalyticsReader()

    const snapshot = await reader.read()

    expect(snapshot.engagement).toEqual({
      hotmart: { total: 1, sum: 12.5 },
      curseduca: { total: 1, sum: unsafeLongAsDouble },
      combined: { total: 1, sum: 12.5 },
    })

    const publicResult = await new MultiPlatformAnalyticsService({
      read: async () => snapshot,
    }).get()
    expect(publicResult.engagement).toEqual({
      hotmart: { total: 1, sum: 12.5, avg: 12.5 },
      curseduca: {
        total: 1,
        sum: unsafeLongAsDouble,
        avg: unsafeLongAsDouble,
      },
      combined: { total: 1, sum: 12.5, avg: 12.5 },
    })

    const sums = [
      snapshot.engagement.hotmart.sum,
      snapshot.engagement.curseduca.sum,
      snapshot.engagement.combined.sum,
      publicResult.engagement.hotmart.sum,
      publicResult.engagement.curseduca.sum,
      publicResult.engagement.combined.sum,
    ]
    for (const sum of sums) {
      expect(typeof sum).toBe('number')
      expect(Number.isFinite(sum)).toBe(true)
    }
  })

  it('includes both finite double extrema while combined keeps only the positive score', async () => {
    await User.collection.insertMany([
      {
        email: 'positive-max-score@example.test',
        name: 'Positive Max Score',
        hotmart: {
          hotmartUserId: 'hotmart-positive-max',
          engagement: { engagementScore: Number.MAX_VALUE },
        },
      },
      {
        email: 'negative-max-score@example.test',
        name: 'Negative Max Score',
        curseduca: {
          curseducaUserId: 'curseduca-negative-max',
          engagement: { alternativeEngagement: -Number.MAX_VALUE },
        },
      },
    ])
    const reader = new MongooseMultiPlatformAnalyticsReader()

    await expect(reader.read()).resolves.toMatchObject({
      engagement: {
        hotmart: { total: 1, sum: Number.MAX_VALUE },
        curseduca: { total: 1, sum: -Number.MAX_VALUE },
        combined: { total: 1, sum: Number.MAX_VALUE },
      },
    })
  })

  it('returns the exact typed zero snapshot without a fallback query', async () => {
    const aggregate = jest.spyOn(User, 'aggregate')
    const find = jest.spyOn(User, 'find')
    const countDocuments = jest.spyOn(User, 'countDocuments')
    const reader = new MongooseMultiPlatformAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      totalUsers: 0,
      activeUsers: 0,
      hotmartUsers: 0,
      curseducaUsers: 0,
      discordUsers: 0,
      multiPlatformUsers: 0,
      engagement: {
        hotmart: { total: 0, sum: 0 },
        curseduca: { total: 0, sum: 0 },
        combined: { total: 0, sum: 0 },
      },
    })
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(find).not.toHaveBeenCalled()
    expect(countDocuments).not.toHaveBeenCalled()
  })
})
