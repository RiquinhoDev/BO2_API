import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import { Class } from '../../../src/models/Class'
import User from '../../../src/models/user'
import { MongooseBenchmarkAnalyticsReader } from '../../../src/services/analytics/mongooseBenchmarkAnalytics.reader'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'benchmark_analytics_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('benchmark_analytics_test')),
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

describe('MongooseBenchmarkAnalyticsReader', () => {
  it('groups canonical metrics for every active class in two reads', async () => {
    await Class.collection.insertMany([
      { classId: 'class-1', name: 'One', isActive: true },
      { classId: 'class-2', name: '', status: 'active' },
      { classId: 'class-inactive', name: 'Inactive', isActive: false },
    ])
    await User.collection.insertMany([
      {
        email: 'canonical-zero@example.test',
        classId: 'class-1',
        status: 'ACTIVE',
        combined: {
          status: 'INACTIVE',
          engagement: { score: 0 },
          combinedEngagement: 99,
          totalProgress: 0,
        },
        hotmart: {
          engagement: { engagementScore: 99 },
          progress: {
            completedLessons: 1,
            lessonsData: [{ completed: true }],
          },
        },
        curseduca: {
          engagement: { alternativeEngagement: 99 },
          progress: { estimatedProgress: 99 },
        },
      },
      {
        email: 'canonical-clamped@example.test',
        classId: 'class-1',
        combined: {
          status: 'ACTIVE',
          engagement: { score: 120 },
          totalProgress: -10,
        },
      },
      {
        email: 'hotmart-fallback@example.test',
        classId: 'class-2',
        status: 'ACTIVE',
        hotmart: {
          engagement: { engagementScore: 45 },
          progress: {
            completedLessons: 2,
            lessonsData: [{}, {}, {}, {}],
          },
        },
        curseduca: {
          engagement: { alternativeEngagement: 90 },
          progress: { estimatedProgress: 90 },
        },
      },
      {
        email: 'curseduca-fallback@example.test',
        classId: 'class-2',
        combined: { status: 'INACTIVE' },
        curseduca: {
          engagement: { alternativeEngagement: 25 },
          progress: { estimatedProgress: 35 },
        },
      },
      {
        email: 'zero-lessons@example.test',
        classId: 'class-2',
        hotmart: {
          progress: {
            completedLessons: 5,
            lessonsData: [],
          },
        },
        curseduca: { progress: { estimatedProgress: 40 } },
      },
      {
        email: 'top-deleted@example.test',
        classId: 'class-1',
        isDeleted: true,
        combined: {
          status: 'ACTIVE',
          engagement: { score: 100 },
          totalProgress: 100,
        },
      },
      {
        email: 'discord-deleted@example.test',
        classId: 'class-1',
        discord: { isDeleted: true },
        combined: {
          status: 'ACTIVE',
          engagement: { score: 100 },
          totalProgress: 100,
        },
      },
      {
        email: 'inactive-class@example.test',
        classId: 'class-inactive',
        combined: {
          status: 'ACTIVE',
          engagement: { score: 100 },
          totalProgress: 100,
        },
      },
    ])

    const classFind = jest.spyOn(Class, 'find')
    const userAggregate = jest.spyOn(User, 'aggregate')
    const userCount = jest.spyOn(User, 'countDocuments')
    const reader = new MongooseBenchmarkAnalyticsReader()
    const result = await reader.read()

    expect(result.activeClasses).toEqual([
      { classId: 'class-1', className: 'One' },
      { classId: 'class-2', className: 'Turma sem nome' },
    ])
    expect([...result.metricsByClassId]).toEqual([
      ['class-1', {
        totalStudents: 2,
        activeStudents: 1,
        averageEngagement: 50,
        averageProgress: 0,
      }],
      ['class-2', {
        totalStudents: 3,
        activeStudents: 1,
        averageEngagement: 23,
        averageProgress: 42,
      }],
    ])
    expect(classFind).toHaveBeenCalledTimes(1)
    expect(userAggregate).toHaveBeenCalledTimes(1)
    expect(userCount).not.toHaveBeenCalled()
    expect(classFind.mock.results[0]?.value.projection()).toEqual({
      classId: 1,
      name: 1,
      _id: 0,
    })
  })

  it('skips the user aggregation when there are no active classes', async () => {
    await Class.collection.insertOne({
      classId: 'class-inactive',
      name: 'Inactive',
      isActive: false,
    })
    const userAggregate = jest.spyOn(User, 'aggregate')
    const reader = new MongooseBenchmarkAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      activeClasses: [],
      metricsByClassId: new Map(),
    })
    expect(userAggregate).not.toHaveBeenCalled()
  })
})
