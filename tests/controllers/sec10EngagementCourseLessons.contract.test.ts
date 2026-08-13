import request from 'supertest'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { type EngagementStats, statsCache } from '../../src/services/engagement/controllerSupport'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

type AsyncBoundaryMock = jest.Mock<Promise<unknown>, unknown[]>

const mockCourseFind = jest.fn()
const mockCourseFindById: AsyncBoundaryMock = jest.fn()
const mockCourseFindOne: AsyncBoundaryMock = jest.fn()
const mockCourseCreate: AsyncBoundaryMock = jest.fn()
const mockCourseFindByIdAndUpdate: AsyncBoundaryMock = jest.fn()
const mockTagRuleFind = jest.fn()
const mockTagRuleUpdateMany: AsyncBoundaryMock = jest.fn()

jest.mock('../../src/models/Course', () => ({
  __esModule: true,
  default: {
    find: mockCourseFind,
    findById: mockCourseFindById,
    findOne: mockCourseFindOne,
    create: mockCourseCreate,
    findByIdAndUpdate: mockCourseFindByIdAndUpdate,
  },
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: {
    find: mockTagRuleFind,
    updateMany: mockTagRuleUpdateMany,
  },
}))

jest.mock('../../src/controllers/acTags/activeCampaignCourse.controller', () => ({
  getClarezaStudents: jest.fn(),
  evaluateClarezaRules: jest.fn(),
  getOGIStudents: jest.fn(),
  evaluateOGIRules: jest.fn(),
}))

const mockGetUserLessonsData: AsyncBoundaryMock = jest.fn()
const mockGetMultipleUsersLessons: AsyncBoundaryMock = jest.fn()
const mockGetUserLessons: AsyncBoundaryMock = jest.fn()
const mockCalculateGlobalStats = jest.fn()

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService', () => ({
  hotmartLessonsService: {
    getUserLessonsData: mockGetUserLessonsData,
    getMultipleUsersLessons: mockGetMultipleUsersLessons,
    getUserLessons: mockGetUserLessons,
    calculateGlobalStats: mockCalculateGlobalStats,
  },
}))

const mockUserAggregate = jest.fn()
const mockUserCountDocuments: AsyncBoundaryMock = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    aggregate: mockUserAggregate,
    countDocuments: mockUserCountDocuments,
    db: { collection: jest.fn() },
  },
}))

const mockCalculateCohortRetention: AsyncBoundaryMock = jest.fn()
const mockCalculateCohortMetrics: AsyncBoundaryMock = jest.fn()
const mockCalculateSummary: AsyncBoundaryMock = jest.fn()

jest.mock('../../src/services/analytics/cohortAnalytics.service', () => ({
  __esModule: true,
  default: {
    calculateCohortRetention: mockCalculateCohortRetention,
    calculateCohortMetrics: mockCalculateCohortMetrics,
    calculateSummary: mockCalculateSummary,
  },
}))

import courseRouter from '../../src/routes/course.routes'
import engagementRouter from '../../src/routes/engagement.routes'
import lessonsRouter from '../../src/routes/lessons.routes'
import cohortAnalyticsRouter from '../../src/routes/cohortAnalytics.routes'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '__bo2_offline_loopback=1'

interface Operation {
  name: string
  method: 'delete' | 'get' | 'post' | 'put'
  mountPath: string
  path: string
  router: typeof courseRouter
  arrange: (failure: unknown) => void
  code: string
  message: string
  body?: Record<string, unknown>
}

const operations: Operation[] = [
  {
    name: 'list courses', method: 'get', mountPath: '/api/courses', path: '/', router: courseRouter,
    arrange: (failure) => { mockCourseFind.mockImplementationOnce(() => { throw failure }) },
    code: 'COURSE_LIST_FAILED', message: 'Erro ao listar cursos',
  },
  {
    name: 'read course', method: 'get', mountPath: '/api/courses', path: '/course-id', router: courseRouter,
    arrange: (failure) => { mockCourseFindById.mockRejectedValueOnce(failure) },
    code: 'COURSE_READ_FAILED', message: 'Erro ao buscar curso',
  },
  {
    name: 'create course', method: 'post', mountPath: '/api/courses', path: '/', router: courseRouter,
    arrange: (failure) => { mockCourseFindOne.mockRejectedValueOnce(failure) },
    code: 'COURSE_CREATE_FAILED', message: 'Erro ao criar curso', body: { code: 'COURSE' },
  },
  {
    name: 'update course', method: 'put', mountPath: '/api/courses', path: '/course-id', router: courseRouter,
    arrange: (failure) => { mockCourseFindByIdAndUpdate.mockRejectedValueOnce(failure) },
    code: 'COURSE_UPDATE_FAILED', message: 'Erro ao atualizar curso', body: { name: 'Course' },
  },
  {
    name: 'delete course', method: 'delete', mountPath: '/api/courses', path: '/course-id', router: courseRouter,
    arrange: (failure) => { mockCourseFindByIdAndUpdate.mockRejectedValueOnce(failure) },
    code: 'COURSE_DELETE_FAILED', message: 'Erro ao deletar curso',
  },
  {
    name: 'read user lessons', method: 'get', mountPath: '/api/lessons', path: '/user/user-id?subdomain=course', router: lessonsRouter,
    arrange: (failure) => { mockGetUserLessonsData.mockRejectedValueOnce(failure) },
    code: 'LESSONS_USER_READ_FAILED', message: 'Erro ao buscar lições do utilizador',
  },
  {
    name: 'read multiple user lessons', method: 'post', mountPath: '/api/lessons', path: '/multiple', router: lessonsRouter,
    arrange: (failure) => { mockGetMultipleUsersLessons.mockRejectedValueOnce(failure) },
    code: 'LESSONS_MULTIPLE_READ_FAILED', message: 'Erro ao buscar lições de múltiplos utilizadores',
    body: { userIds: ['user-id'], subdomain: 'course' },
  },
  {
    name: 'read integrated user lessons', method: 'get', mountPath: '/api/lessons', path: '/user/user-id/integrated?subdomain=course', router: lessonsRouter,
    arrange: (failure) => { mockGetUserLessonsData.mockRejectedValueOnce(failure) },
    code: 'LESSONS_INTEGRATED_READ_FAILED', message: 'Erro ao buscar lições integradas',
  },
  {
    name: 'read lesson stats', method: 'get', mountPath: '/api/lessons', path: '/stats?subdomain=course&userIds=user-id', router: lessonsRouter,
    arrange: (failure) => { mockGetMultipleUsersLessons.mockRejectedValueOnce(failure) },
    code: 'LESSONS_STATS_READ_FAILED', message: 'Erro ao calcular estatísticas das lições',
  },
  {
    name: 'test lesson integration', method: 'get', mountPath: '/api/lessons', path: '/test?subdomain=course&testUserId=user-id', router: lessonsRouter,
    arrange: (failure) => { mockGetUserLessons.mockRejectedValueOnce(failure) },
    code: 'LESSONS_INTEGRATION_TEST_FAILED', message: 'Erro na conexão com Hotmart',
  },
  {
    name: 'read global engagement summary', method: 'get', mountPath: '/api/engagement', path: '/stats', router: engagementRouter,
    arrange: (failure) => { mockUserAggregate.mockImplementationOnce(() => { throw failure }) },
    code: 'ENGAGEMENT_SUMMARY_READ_FAILED', message: 'Erro ao calcular estatísticas de engagement',
  },
  {
    name: 'read user engagement details', method: 'get', mountPath: '/api/engagement', path: '/users', router: engagementRouter,
    arrange: (failure) => { mockUserAggregate.mockImplementationOnce(() => { throw failure }) },
    code: 'ENGAGEMENT_USERS_READ_FAILED', message: 'Erro ao buscar detalhes de engagement',
  },
  {
    name: 'read engagement stats alias', method: 'get', mountPath: '/api/engagement', path: '/engagement/stats', router: engagementRouter,
    arrange: (failure) => { mockUserAggregate.mockImplementationOnce(() => { throw failure }) },
    code: 'ENGAGEMENT_STATS_READ_FAILED', message: 'Erro ao calcular estatísticas',
  },
  {
    name: 'read engagement details alias', method: 'get', mountPath: '/api/engagement', path: '/engagement/details', router: engagementRouter,
    arrange: (failure) => { mockUserAggregate.mockImplementationOnce(() => { throw failure }) },
    code: 'ENGAGEMENT_DETAILS_READ_FAILED', message: 'Erro ao buscar detalhes de engagement',
  },
  {
    name: 'clear engagement cache alias', method: 'post', mountPath: '/api/engagement', path: '/engagement/cache/clear', router: engagementRouter,
    arrange: (failure) => { jest.spyOn(statsCache, 'clear').mockImplementationOnce(() => { throw failure }) },
    code: 'ENGAGEMENT_CACHE_CLEAR_FAILED', message: 'Erro ao limpar cache',
  },
  {
    name: 'read cohort analytics', method: 'get', mountPath: '/api/analytics/cohort', path: '/', router: cohortAnalyticsRouter,
    arrange: (failure) => { mockCalculateCohortRetention.mockRejectedValueOnce(failure) },
    code: 'COHORT_ANALYTICS_READ_FAILED', message: 'Failed to fetch cohort analysis',
  },
]

describe('SEC-10 engagement, course, lessons application boundary', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    statsCache.clear()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('covers the corrected exact 16-site migration membership', () => {
    expect(operations).toHaveLength(16)
    expect(new Set(operations.map(({ code }) => code)).size).toBe(16)
  })

  it.each(operations)('$name returns its stable redacted central envelope', async (operation) => {
    operation.arrange(secret)
    const app = appForCentralError({ kind: 'router', mountPath: operation.mountPath, router: operation.router })
    const separator = operation.path.includes('?') ? '&' : '?'
    const pending = request(app)[operation.method](`${operation.mountPath}${operation.path}${separator}${offline}`)
    const response = operation.body === undefined ? await pending : await pending.send(operation.body)

    expectCentralError(response, { code: operation.code, message: operation.message })
  })

  it('normalizes a non-Error rejection', async () => {
    const operation = operations[5]
    operation.arrange('secret alice@example.test token=hidden')
    const app = appForCentralError({ kind: 'router', mountPath: operation.mountPath, router: operation.router })
    const response = await request(app).get(`${operation.mountPath}${operation.path}&${offline}`)

    expectCentralError(response, { code: operation.code, message: operation.message })
  })

  it('preserves IntegrationUnavailable classification', async () => {
    const operation = operations[5]
    operation.arrange(new IntegrationUnavailableError('hotmart'))
    const app = appForCentralError({ kind: 'router', mountPath: operation.mountPath, router: operation.router })
    const response = await request(app).get(`${operation.mountPath}${operation.path}&${offline}`)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      success: false,
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível',
      correlationId: 'sec10-request',
    })
  })

  it('preserves course not-found handling', async () => {
    mockCourseFindById.mockResolvedValueOnce(null)
    const app = appForCentralError({ kind: 'router', mountPath: '/api/courses', router: courseRouter })
    const response = await request(app).get(`/api/courses/missing?${offline}`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ success: false, error: 'Curso não encontrado' })
  })

  it('preserves lesson validation before integration access', async () => {
    const app = appForCentralError({ kind: 'router', mountPath: '/api/lessons', router: lessonsRouter })
    const response = await request(app).get(`/api/lessons/user/user-id?${offline}`)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ success: false, message: 'subdomain é obrigatório' })
    expect(mockGetUserLessonsData).not.toHaveBeenCalled()
  })

  describe('ARCH03 engagement success contracts', () => {
    const summary: EngagementStats = {
      totalUsers: 4,
      averageScore: 50,
      distribution: {
        MUITO_BAIXO: 0,
        BAIXO: 1,
        MEDIO: 1,
        ALTO: 1,
        MUITO_ALTO: 1,
      },
      topPerformersCount: 2,
      needsAttentionCount: 1,
      platformStats: {
        hotmartUsers: 3,
        discordUsers: 2,
        curseducaUsers: 2,
        activeUsers: 3,
        inactiveUsers: 1,
      },
    }

    const engagementApp = () => appForCentralError({
      kind: 'router',
      mountPath: '/api/engagement',
      router: engagementRouter,
    })

    const aggregateWithDiskUse = (value: unknown[]) => ({
      allowDiskUse: jest.fn().mockResolvedValue(value),
    })

    it('moves calculated-summary cache and timing fields to meta', async () => {
      mockUserAggregate.mockReturnValueOnce(aggregateWithDiskUse([{
        totalUsers: 4,
        averageScore: 50,
        MUITO_BAIXO: 0,
        BAIXO: 1,
        MEDIO: 1,
        ALTO: 1,
        MUITO_ALTO: 1,
        topPerformersCount: 2,
        needsAttentionCount: 1,
        hotmartUsers: 3,
        discordUsers: 2,
        curseducaUsers: 2,
        activeUsers: 3,
        inactiveUsers: 1,
      }]))

      const response = await request(engagementApp())
        .get(`/api/engagement/stats?${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: summary,
        meta: {
          cached: false,
          cacheAge: 0,
          timestamp: expect.any(String),
          processingMethod: 'mongodb-aggregation',
          processingTime: expect.any(Number),
        },
      })
    })

    it('keeps empty-summary data complete and moves timing to meta', async () => {
      mockUserAggregate.mockReturnValueOnce(aggregateWithDiskUse([]))

      const response = await request(engagementApp())
        .get(`/api/engagement/stats?${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          totalUsers: 0,
          averageScore: 0,
          distribution: {
            MUITO_BAIXO: 0,
            BAIXO: 0,
            MEDIO: 0,
            ALTO: 0,
            MUITO_ALTO: 0,
          },
          topPerformersCount: 0,
          needsAttentionCount: 0,
          platformStats: {
            hotmartUsers: 0,
            discordUsers: 0,
            curseducaUsers: 0,
            activeUsers: 0,
            inactiveUsers: 0,
          },
        },
        meta: {
          timestamp: expect.any(String),
          processingTime: expect.any(Number),
        },
      })
    })

    it('moves cached-summary cache age and timing to meta', async () => {
      statsCache.set('global-engagement-stats', summary)

      const response = await request(engagementApp())
        .get(`/api/engagement/stats?${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: summary,
        meta: {
          cached: true,
          cacheAge: expect.any(Number),
          processingTime: expect.any(Number),
        },
      })
      expect(mockUserAggregate).not.toHaveBeenCalled()
    })

    it('wraps clear-cache count and preserves the real clear side effect', async () => {
      statsCache.set('global-engagement-stats', summary)

      const response = await request(engagementApp())
        .post(`/api/engagement/engagement/cache/clear?${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { clearedItems: 1 },
        meta: { message: 'Cache de engagement limpo com sucesso' },
      })
      expect(statsCache.getSize()).toBe(0)
    })

    it('moves users pagination, performance, and timestamp to meta', async () => {
      const user = {
        _id: 'user-1',
        name: 'Ana',
        email: 'ana@example.test',
        engagementScore: 42,
        engagement: 'MEDIO',
        accessCount: 3,
        progress: { completed: 2, total: 4, completedPercentage: 50 },
      }
      mockUserAggregate.mockReturnValueOnce(aggregateWithDiskUse([{
        totalCount: [{ total: 11 }],
        paginatedData: [user],
      }]))

      const response = await request(engagementApp())
        .get(`/api/engagement/users?page=2&limit=10&minScore=20&maxScore=80&search=Ana&${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { users: [user] },
        meta: {
          pagination: {
            currentPage: 2,
            totalPages: 2,
            totalItems: 11,
            itemsPerPage: 10,
            hasNextPage: false,
            hasPrevPage: true,
            isComplete: true,
          },
          performance: {
            executionTimeMs: expect.any(Number),
            method: 'mongodb-aggregation',
            totalProcessed: 11,
            scoreRange: '20-80',
            search: 'Ana',
          },
          timestamp: expect.any(String),
        },
      })
    })

    it('moves details pagination, filters, and timestamp to meta', async () => {
      const user = {
        _id: 'user-1',
        name: 'Ana',
        engagementScore: 40,
        activityLevel: 'MEDIO',
      }
      mockUserAggregate
        .mockReturnValueOnce(aggregateWithDiskUse([user]))
        .mockResolvedValueOnce([{ total: 7 }])
        .mockResolvedValueOnce([{ _id: 'MEDIO', count: 7, avgScore: 40 }])

      const response = await request(engagementApp())
        .get(`/api/engagement/engagement/details?minScore=10&maxScore=60&page=2&limit=5&level=MEDIO&${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          users: [user],
          distribution: {
            MUITO_ALTO: 0,
            ALTO: 0,
            MEDIO: 7,
            BAIXO: 0,
            MUITO_BAIXO: 0,
          },
          stats: { totalInRange: 7, averageScore: 40 },
        },
        meta: {
          pagination: {
            currentPage: 2,
            totalPages: 2,
            totalItems: 7,
            itemsPerPage: 5,
            hasNext: false,
            hasPrev: true,
          },
          filters: { minScore: 10, maxScore: 60, level: 'MEDIO' },
          timestamp: expect.any(String),
        },
      })
    })

    it('wraps engagement stats and moves timestamp to meta', async () => {
      mockUserAggregate.mockResolvedValueOnce([{
        totalUsers: 4,
        totalScore: 200,
        activeUsers: 2,
        hotmartUsers: 3,
        discordUsers: 1,
        curseducaUsers: 2,
        muitoAlto: 1,
        alto: 1,
        medio: 1,
        baixo: 1,
        muitoBaixo: 0,
      }])
      mockUserCountDocuments
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)

      const response = await request(engagementApp())
        .get(`/api/engagement/engagement/stats?${offline}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          totalUsers: 4,
          activeUsers: 2,
          averageScore: 50,
          distribution: {
            MUITO_ALTO: 1,
            ALTO: 1,
            MEDIO: 1,
            BAIXO: 1,
            MUITO_BAIXO: 0,
          },
          platformStats: {
            hotmartUsers: 3,
            discordUsers: 1,
            curseducaUsers: 2,
            activeUsers: 2,
          },
        },
        meta: { timestamp: expect.any(String) },
      })
    })
  })

})
