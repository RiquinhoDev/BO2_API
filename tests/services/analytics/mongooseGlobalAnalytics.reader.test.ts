import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import { Class } from '../../../src/models/Class'
import User from '../../../src/models/user'
import { MongooseGlobalAnalyticsReader } from '../../../src/services/analytics/mongooseGlobalAnalytics.reader'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'global_analytics_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('global_analytics_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
  ])
})

describe('MongooseGlobalAnalyticsReader', () => {
  it('aggregates canonical status and engagement across active classes', async () => {
    await Class.collection.insertMany([
      { classId: 'class-1', name: 'One', isActive: true },
      {
        classId: 'class-legacy',
        name: 'Legacy',
        isActive: false,
        status: 'active',
      },
      { classId: 'class-inactive', name: 'Inactive', isActive: false },
    ])
    await User.collection.insertMany([
      {
        email: 'combined-score@example.test',
        name: 'Combined score',
        classId: 'class-1',
        discord: { isDeleted: false },
        combined: {
          status: 'ACTIVE',
          engagement: { score: 85 },
          combinedEngagement: 10,
        },
      },
      {
        email: 'combined-fallback@example.test',
        name: 'Combined fallback',
        classId: 'class-1',
        discord: { isDeleted: false },
        combined: {
          status: 'INACTIVE',
          combinedEngagement: 65,
        },
      },
      {
        email: 'hotmart-fallback@example.test',
        name: 'Hotmart fallback',
        classId: 'class-legacy',
        discord: { isDeleted: false },
        combined: { status: 'ACTIVE' },
        hotmart: { engagement: { engagementScore: 45 } },
      },
      {
        email: 'curseduca-fallback@example.test',
        name: 'CursEduca fallback',
        classId: 'class-legacy',
        discord: { isDeleted: false },
        combined: { status: 'ACTIVE' },
        curseduca: { engagement: { alternativeEngagement: 25 } },
      },
      {
        email: 'missing-score@example.test',
        name: 'Missing score',
        classId: 'class-1',
        discord: { isDeleted: false },
        combined: { status: 'INACTIVE' },
      },
      {
        email: 'deleted@example.test',
        name: 'Deleted',
        classId: 'class-1',
        discord: { isDeleted: true },
        combined: {
          status: 'ACTIVE',
          engagement: { score: 100 },
        },
      },
      {
        email: 'inactive-class@example.test',
        name: 'Inactive class',
        classId: 'class-inactive',
        discord: { isDeleted: false },
        combined: {
          status: 'ACTIVE',
          engagement: { score: 100 },
        },
      },
    ])
    const classFind = jest.spyOn(Class, 'find')
    const userAggregate = jest.spyOn(User, 'aggregate')
    const reader = new MongooseGlobalAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      totalClasses: 2,
      totalStudents: 5,
      activeStudents: 3,
      averageEngagement: 44,
      engagementDistribution: {
        muito_alto: 1,
        alto: 1,
        medio: 1,
        baixo: 1,
        muito_baixo: 1,
      },
    })
    expect(userAggregate).toHaveBeenCalledTimes(1)
    expect(classFind.mock.results[0]?.value.projection()).toEqual({
      classId: 1,
      _id: 0,
    })
  })

  it('does not query users when no active class exists', async () => {
    await Class.collection.insertOne({
      classId: 'class-inactive',
      name: 'Inactive',
      isActive: false,
    })
    const userAggregate = jest.spyOn(User, 'aggregate')
    const reader = new MongooseGlobalAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      totalClasses: 0,
      totalStudents: 0,
      activeStudents: 0,
      averageEngagement: 0,
      engagementDistribution: {
        muito_alto: 0,
        alto: 0,
        medio: 0,
        baixo: 0,
        muito_baixo: 0,
      },
    })
    expect(userAggregate).not.toHaveBeenCalled()
  })
})
