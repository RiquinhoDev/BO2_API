import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import { MongooseUsersSimpleListRepository } from '../../../src/services/users/mongooseUsersSimpleList.repository'

let mongoServer: MongoMemoryServer

const objectId = (suffix: number) =>
  new mongoose.Types.ObjectId(suffix.toString(16).padStart(24, '0'))

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_simple_list_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('users_simple_list_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    User.collection.deleteMany({}),
    mongoose.connection.db?.collection('classes').deleteMany({}),
  ])
  jest.restoreAllMocks()
})

const insertUser = async (
  sequence: number,
  fields: Record<string, unknown> = {},
) => {
  await User.collection.insertOne({
    _id: objectId(sequence),
    email: `student-${sequence}@example.test`,
    name: `Student ${sequence}`,
    ...fields,
  })
}

describe('MongooseUsersSimpleListRepository', () => {
  it('uses stable id ordering with a positive limit on every page', async () => {
    await Promise.all([
      insertUser(3),
      insertUser(1),
      insertUser(4),
      insertUser(2),
    ])
    const find = jest.spyOn(User, 'find')
    const repository = new MongooseUsersSimpleListRepository()

    const first = await repository.list({
      page: 1,
      limit: 2,
      skip: 0,
    })
    const second = await repository.list({
      page: 2,
      limit: 2,
      skip: 2,
    })

    expect(first.users.map((user) => user._id)).toEqual([
      objectId(1).toString(),
      objectId(2).toString(),
    ])
    expect(second.users.map((user) => user._id)).toEqual([
      objectId(3).toString(),
      objectId(4).toString(),
    ])
    expect(find).toHaveBeenCalledTimes(2)
    for (const result of find.mock.results) {
      expect(result.value.getOptions()).toMatchObject({
        limit: 2,
        sort: { _id: 1 },
      })
    }
  })

  it('preserves active and inactive legacy status semantics and excludes deleted users', async () => {
    await Promise.all([
      insertUser(1, { status: 'ACTIVE' }),
      insertUser(2, { estado: 'Ativo' }),
      insertUser(3, { status: 'INACTIVE', estado: 'inativo' }),
      insertUser(4, { status: 'ACTIVE', isDeleted: true }),
    ])
    const repository = new MongooseUsersSimpleListRepository()

    const active = await repository.list({
      page: 1,
      limit: 50,
      skip: 0,
      status: 'active',
    })
    const inactive = await repository.list({
      page: 1,
      limit: 50,
      skip: 0,
      status: 'inactive',
    })

    expect(active.users.map((user) => user._id)).toEqual([
      objectId(1).toString(),
      objectId(2).toString(),
    ])
    expect(active.total).toBe(2)
    expect(inactive.users.map((user) => user._id)).toEqual([
      objectId(3).toString(),
    ])
    expect(inactive.total).toBe(1)
  })

  it('projects the complete response source and resolves classes from the current page only', async () => {
    await Promise.all([
      insertUser(1, {
        username: 'student',
        classId: 'class-current',
        status: 'ACTIVE',
        estado: 'ativo',
        role: 'STUDENT',
        type: 'student',
        purchaseDate: new Date('2026-01-01T00:00:00.000Z'),
        lastAccessDate: new Date('2026-02-01T00:00:00.000Z'),
        acceptedTerms: true,
        plusAccess: false,
        hotmartUserId: 'hotmart-legacy',
        curseducaUserId: 'curseduca-legacy',
        discordIds: ['discord-1'],
        engagement: 'LOW',
        accessCount: 2,
        progress: { completedPercentage: 5 },
        hotmart: {
          hotmartUserId: 'hotmart-nested',
          engagement: {
            engagementLevel: 'ALTO',
            accessCount: 3,
            engagementScore: 70,
          },
          progress: {
            completedLessons: 1,
            lessonsData: [{ lessonId: 'lesson-1' }],
            totalTimeMinutes: 20,
          },
        },
        curseduca: {
          curseducaUserId: 'curseduca-nested',
          engagement: {
            engagementLevel: 'MEDIO',
            accessCount: 4,
            alternativeEngagement: 60,
          },
          progress: { estimatedProgress: 35 },
        },
        combined: {
          engagement: { level: 'MUITO_ALTO' },
          combinedEngagement: 'ALTO',
          totalProgress: 80,
        },
        rawSecret: 'must-not-leak',
      }),
      insertUser(2, { classId: 'class-next-page' }),
    ])
    const classNameLoader = jest.fn().mockResolvedValue(
      new Map([['class-current', 'Current Class']]),
    )
    const repository = new MongooseUsersSimpleListRepository(classNameLoader)

    const result = await repository.list({
      page: 1,
      limit: 1,
      skip: 0,
    })

    expect(result.users).toHaveLength(1)
    expect(result.users[0]).toMatchObject({
      _id: objectId(1).toString(),
      email: 'student-1@example.test',
      name: 'Student 1',
      username: 'student',
      classId: 'class-current',
      className: 'Current Class',
      status: 'ACTIVE',
      acceptedTerms: true,
      hotmart: {
        hotmartUserId: 'hotmart-nested',
        progress: { completedLessons: 1 },
      },
      curseduca: {
        curseducaUserId: 'curseduca-nested',
        progress: { estimatedProgress: 35 },
      },
      combined: { totalProgress: 80 },
    })
    expect(result.users[0]).not.toHaveProperty('rawSecret')
    expect(classNameLoader).toHaveBeenCalledWith(['class-current'])
  })
})
