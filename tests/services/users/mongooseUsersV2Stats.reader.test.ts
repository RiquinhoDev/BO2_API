import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import UserProduct from '../../../src/models/UserProduct'
import { MongooseUsersV2StatsReader } from '../../../src/services/users/mongooseUsersV2Stats.reader'

const now = new Date('2026-07-30T12:00:00.000Z')
const dayMs = 24 * 60 * 60 * 1000
const inactiveCutoff = new Date(now.getTime() - (30 * dayMs))
const newCutoff = new Date(now.getTime() - (7 * dayMs))

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_v2_stats_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('users_v2_stats_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
  ])
})

describe('MongooseUsersV2StatsReader', () => {
  it('aggregates enrollment stats and numeric BSON variants in one bounded query', async () => {
    const userWithOldActivity = new mongoose.Types.ObjectId()
    const userAtInactiveBoundary = new mongoose.Types.ObjectId()
    const userWithoutActivity = new mongoose.Types.ObjectId()
    const userWithRecentActivity = new mongoose.Types.ObjectId()
    const objectScoreUser = new mongoose.Types.ObjectId()
    const nanScoreUser = new mongoose.Types.ObjectId()
    const infiniteScoreUser = new mongoose.Types.ObjectId()
    const missingScoreUser = new mongoose.Types.ObjectId()
    const productOne = new mongoose.Types.ObjectId()
    const productTwo = new mongoose.Types.ObjectId()
    const productThree = new mongoose.Types.ObjectId()
    const productFour = new mongoose.Types.ObjectId()
    const productFive = new mongoose.Types.ObjectId()
    const ignoredProduct = new mongoose.Types.ObjectId()

    await User.collection.insertMany([
      {
        _id: userWithOldActivity,
        email: 'old-activity@example.test',
        name: 'Old Activity',
        discord: {
          engagement: {
            lastMessageDate: new Date(inactiveCutoff.getTime() - 1),
          },
        },
      },
      {
        _id: userAtInactiveBoundary,
        email: 'boundary-activity@example.test',
        name: 'Boundary Activity',
        discord: {
          engagement: {
            lastMessageDate: inactiveCutoff,
          },
        },
      },
      {
        _id: userWithoutActivity,
        email: 'missing-activity@example.test',
        name: 'Missing Activity',
      },
      {
        _id: userWithRecentActivity,
        email: 'recent-activity@example.test',
        name: 'Recent Activity',
        discord: {
          engagement: {
            lastMessageDate: new Date(now.getTime() - dayMs),
          },
        },
      },
      {
        _id: objectScoreUser,
        email: 'object-score@example.test',
        name: 'Object Score',
      },
      {
        _id: nanScoreUser,
        email: 'nan-score@example.test',
        name: 'NaN Score',
      },
      {
        _id: infiniteScoreUser,
        email: 'infinite-score@example.test',
        name: 'Infinite Score',
      },
      {
        _id: missingScoreUser,
        email: 'missing-score@example.test',
        name: 'Missing Score',
      },
    ])
    await UserProduct.collection.insertMany([
      {
        userId: userWithOldActivity,
        productId: productOne,
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: newCutoff,
        engagement: { engagementScore: 80 },
        progress: { percentage: 50 },
      },
      {
        userId: userWithOldActivity,
        productId: productTwo,
        platform: 'curseduca',
        status: 'ACTIVE',
        enrolledAt: new Date(newCutoff.getTime() - 1),
        engagement: { engagementScore: 20 },
        progress: {
          percentage: mongoose.mongo.Decimal128.fromString('12.5'),
        },
      },
      {
        userId: userAtInactiveBoundary,
        productId: productOne,
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - dayMs),
        engagement: {
          engagementScore: mongoose.mongo.Decimal128.fromString('42.5'),
        },
        progress: {
          percentage: mongoose.mongo.Long.fromString('25'),
        },
      },
      {
        userId: userWithoutActivity,
        productId: productThree,
        platform: 'discord',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - (20 * dayMs)),
        engagement: {
          engagementScore: mongoose.mongo.Long.fromString('7'),
        },
      },
      {
        userId: userWithRecentActivity,
        productId: productThree,
        status: 'ACTIVE',
        enrolledAt: now,
        engagement: { engagementScore: '99' },
        progress: { percentage: '80' },
      },
      {
        userId: objectScoreUser,
        productId: productFour,
        platform: 'curseduca',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - (40 * dayMs)),
        engagement: { engagementScore: { value: 99 } },
        progress: { percentage: { value: 80 } },
      },
      {
        userId: nanScoreUser,
        productId: productFour,
        platform: 'discord',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - (40 * dayMs)),
        engagement: { engagementScore: Number.NaN },
        progress: { percentage: Number.NaN },
      },
      {
        userId: infiniteScoreUser,
        productId: productFive,
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - (40 * dayMs)),
        engagement: { engagementScore: Number.POSITIVE_INFINITY },
        progress: { percentage: Number.NEGATIVE_INFINITY },
      },
      {
        userId: missingScoreUser,
        productId: productFive,
        platform: 'curseduca',
        status: 'ACTIVE',
        enrolledAt: new Date(now.getTime() - (40 * dayMs)),
      },
      {
        userId: userWithOldActivity,
        productId: ignoredProduct,
        platform: 'hotmart',
        status: 'INACTIVE',
        enrolledAt: now,
        engagement: { engagementScore: 100 },
        progress: { percentage: 100 },
      },
    ])
    const aggregate = jest.spyOn(UserProduct, 'aggregate')
    const userProductFind = jest.spyOn(UserProduct, 'find')
    const userProductCount = jest.spyOn(UserProduct, 'countDocuments')
    const userFind = jest.spyOn(User, 'find')
    const reader = new MongooseUsersV2StatsReader()

    await expect(reader.read(now)).resolves.toEqual({
      totalStudents: 9,
      engagementSum: 149.5,
      progressSum: 87.5,
      atRiskCount: 7,
      inactive30d: 2,
      new7d: 3,
      activeProducts: 5,
      byPlatform: [
        { platform: 'curseduca', count: 3 },
        { platform: 'discord', count: 2 },
        { platform: 'hotmart', count: 3 },
        { platform: 'unknown', count: 1 },
      ],
    })
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(userProductFind).not.toHaveBeenCalled()
    expect(userProductCount).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
    expect(aggregate.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      { $match: { status: 'ACTIVE' } },
      {
        $lookup: {
          from: User.collection.name,
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$userId'] },
              },
            },
            {
              $project: {
                _id: 0,
                'discord.engagement.lastMessageDate': 1,
              },
            },
          ],
          as: 'user',
        },
      },
    ]))
  })

  it('returns an exact finite zero snapshot without fallback queries', async () => {
    const aggregate = jest.spyOn(UserProduct, 'aggregate')
    const userProductFind = jest.spyOn(UserProduct, 'find')
    const userProductCount = jest.spyOn(UserProduct, 'countDocuments')
    const userFind = jest.spyOn(User, 'find')
    const reader = new MongooseUsersV2StatsReader()

    await expect(reader.read(now)).resolves.toEqual({
      totalStudents: 0,
      engagementSum: 0,
      progressSum: 0,
      atRiskCount: 0,
      inactive30d: 0,
      new7d: 0,
      activeProducts: 0,
      byPlatform: [],
    })
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(userProductFind).not.toHaveBeenCalled()
    expect(userProductCount).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
  })
})
