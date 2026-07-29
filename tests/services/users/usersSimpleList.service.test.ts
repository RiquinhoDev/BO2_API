import {
  UsersSimpleListService,
  mapUsersSimpleListRecord,
  type UsersSimpleListRepository,
  type UsersSimpleListSource,
} from '../../../src/services/users/usersSimpleList.service'

const source = (
  overrides: Partial<UsersSimpleListSource> = {},
): UsersSimpleListSource => ({
  _id: 'user-1',
  email: 'student@example.test',
  name: 'Student',
  ...overrides,
})

describe('mapUsersSimpleListRecord', () => {
  it('preserves the legacy payload and prioritizes combined values', () => {
    expect(mapUsersSimpleListRecord(source({
      username: 'student',
      classId: 'class-1',
      className: 'Class One',
      status: 'ACTIVE',
      estado: 'ativo',
      role: 'STUDENT',
      type: 'student',
      purchaseDate: new Date('2026-01-01T00:00:00.000Z'),
      lastAccessDate: new Date('2026-02-01T00:00:00.000Z'),
      acceptedTerms: false,
      plusAccess: false,
      discordIds: ['discord-1'],
      hotmartUserId: 'legacy-hotmart',
      curseducaUserId: 'legacy-curseduca',
      accessCount: 2,
      engagement: 'LOW',
      progress: { completedPercentage: 3 },
      hotmart: {
        hotmartUserId: 'nested-hotmart',
        engagement: {
          engagementLevel: 'ALTO',
          accessCount: 4,
        },
        progress: {
          completedLessons: 3,
          lessonsData: [{}, {}, {}, {}],
        },
      },
      curseduca: {
        curseducaUserId: 'nested-curseduca',
        engagement: { engagementLevel: 'MEDIO', accessCount: 5 },
        progress: { estimatedProgress: 45 },
      },
      combined: {
        engagement: { level: 'MUITO_ALTO' },
        totalProgress: 80,
      },
    }))).toMatchObject({
      _id: 'user-1',
      username: 'student',
      email: 'student@example.test',
      name: 'Student',
      hotmartUserId: 'legacy-hotmart',
      curseducaUserId: 'legacy-curseduca',
      discordIds: ['discord-1'],
      classId: 'class-1',
      className: 'Class One',
      status: 'ACTIVE',
      estado: 'ativo',
      role: 'STUDENT',
      type: 'student',
      acceptedTerms: false,
      plusAccess: false,
      engagement: 'MUITO_ALTO',
      accessCount: 4,
      progress: {
        completedPercentage: 80,
        completed: 3,
        total: 4,
      },
    })
  })

  it('uses Hotmart lesson progress before canonical CursEduca and legacy progress', () => {
    expect(mapUsersSimpleListRecord(source({
      hotmart: {
        progress: {
          completedLessons: 1,
          lessonsData: [{}, {}, {}, {}],
        },
      },
      curseduca: { progress: { estimatedProgress: 60 } },
      progress: { completedPercentage: 10 },
    })).progress.completedPercentage).toBe(25)
  })

  it('uses canonical CursEduca estimated progress when Hotmart has no lessons', () => {
    expect(mapUsersSimpleListRecord(source({
      curseduca: { progress: { estimatedProgress: 42 } },
      progress: { completedPercentage: 10 },
    })).progress.completedPercentage).toBe(42)
  })

  it('preserves meaningful zero and false values', () => {
    expect(mapUsersSimpleListRecord(source({
      acceptedTerms: false,
      plusAccess: false,
      accessCount: 0,
      combined: { totalProgress: 0 },
      progress: { completedPercentage: 0 },
    }))).toMatchObject({
      acceptedTerms: false,
      plusAccess: false,
      accessCount: 0,
      progress: { completedPercentage: 0 },
    })
  })
})

describe('UsersSimpleListService', () => {
  it('clamps oversized requests and returns canonical plus legacy metadata', async () => {
    const repository: jest.Mocked<UsersSimpleListRepository> = {
      list: jest.fn().mockResolvedValue({
        users: [source()],
        total: 401,
      }),
    }
    const service = new UsersSimpleListService(repository)

    const result = await service.list({ page: '2', limit: '10000' })

    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      limit: 200,
      skip: 200,
      status: undefined,
    })
    expect(result).toMatchObject({
      count: 401,
      page: 2,
      limit: 200,
      totalPages: 3,
      pagination: {
        page: 2,
        limit: 200,
        total: 401,
        pages: 3,
      },
    })
  })

  it('uses page one and limit fifty by default', async () => {
    const repository: jest.Mocked<UsersSimpleListRepository> = {
      list: jest.fn().mockResolvedValue({ users: [], total: 0 }),
    }
    const service = new UsersSimpleListService(repository)

    await service.list({})

    expect(repository.list).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      skip: 0,
      status: undefined,
    })
  })
})
