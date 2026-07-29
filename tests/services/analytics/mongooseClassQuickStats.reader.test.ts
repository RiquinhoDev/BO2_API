import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import { MongooseClassQuickStatsReader } from '../../../src/services/analytics/mongooseClassQuickStats.reader'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_quick_stats_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('class_quick_stats_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await User.collection.deleteMany({})
  jest.restoreAllMocks()
})

describe('MongooseClassQuickStatsReader', () => {
  it('counts canonical active states and excludes deleted or other-class users', async () => {
    await User.collection.insertMany([
      {
        email: 'active@example.test',
        name: 'Active',
        classId: 'class-1',
        combined: { status: 'ACTIVE' },
        discord: { isDeleted: false },
      },
      {
        email: 'inactive@example.test',
        name: 'Inactive',
        classId: 'class-1',
        combined: { status: 'INACTIVE' },
        discord: { isDeleted: false },
      },
      {
        email: 'missing@example.test',
        name: 'Missing state',
        classId: 'class-1',
        discord: { isDeleted: false },
      },
      {
        email: 'deleted@example.test',
        name: 'Deleted',
        classId: 'class-1',
        combined: { status: 'ACTIVE' },
        discord: { isDeleted: true },
      },
      {
        email: 'other@example.test',
        name: 'Other class',
        classId: 'class-2',
        combined: { status: 'ACTIVE' },
        discord: { isDeleted: false },
      },
    ])
    const aggregate = jest.spyOn(User, 'aggregate')
    const reader = new MongooseClassQuickStatsReader()

    await expect(reader.countByClass('class-1')).resolves.toEqual({
      totalStudents: 3,
      activeStudents: 1,
    })
    expect(aggregate).toHaveBeenCalledTimes(1)
  })

  it('returns zero counts when the class does not exist', async () => {
    const reader = new MongooseClassQuickStatsReader()

    await expect(reader.countByClass('missing-class')).resolves.toEqual({
      totalStudents: 0,
      activeStudents: 0,
    })
  })

  it('installs the reusable class lookup index', async () => {
    await User.syncIndexes()

    await expect(User.collection.indexes()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'users_class_id',
          key: { classId: 1 },
        }),
      ]),
    )
  })
})
