import type { RequestHandler } from 'express'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import {
  createUsersV2EnrollmentController,
  createUsersV2LegacyController,
  createUsersV2OverviewAnalyticsController,
} from '../../src/controllers/users/usersV2List.controller'
import {
  createErrorHandling,
  type ErrorLogEvent,
} from '../../src/security/errorHandling'
import {
  usersV2EnrollmentInput,
  usersV2LegacyInput,
  usersV2OverviewAnalyticsInput,
} from '../../src/security/usersV2ListInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { UsersV2EnrollmentListResponse } from '../../src/services/users/usersV2Enrollment.service'
import type { UsersV2LegacyResponse } from '../../src/contracts/usersV2'
import type { UsersV2OverviewAnalyticsResponse } from '../../src/services/users/usersV2OverviewAnalytics.service'

const marker = { __bo2_offline_loopback: '1' }

const enrollmentResponse: UsersV2EnrollmentListResponse = {
  success: true,
  data: [],
  pagination: {
    total: 0,
    totalPages: 0,
    page: 1,
    limit: 50,
    unit: 'users',
    returnedRows: 0,
  },
  filters: { page: 1, limit: 50 },
}

const analyticsResponse: UsersV2OverviewAnalyticsResponse = {
  success: true,
  data: {
    overview: {
      totalUsers: 0,
      totalActiveUsers: 0,
      totalProducts: 0,
      avgProgress: 0,
    },
    byPlatform: [],
    byProduct: [],
  },
}

const legacyResponse: UsersV2LegacyResponse = {
  success: true,
  data: [],
  pagination: {
    total: 0,
    totalPages: 0,
    page: 1,
    limit: 50,
  },
  filters: {},
}

function createTestApp(
  handler: RequestHandler,
  logError: (event: ErrorLogEvent) => void = jest.fn(),
) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-list-request-id',
    logError,
  })

  app.use(errors.correlationId)
  app.get('/users-v2', handler)
  app.use(errors.handler)

  return app
}

describe('users V2 explicit resource controllers', () => {
  it('passes the validated enrollment DTO and preserves its exact envelope', async () => {
    const list = jest.fn().mockResolvedValue(enrollmentResponse)
    const response = await request(createTestApp(withValidatedInput(
      usersV2EnrollmentInput,
      createUsersV2EnrollmentController({ list }),
    )))
      .get('/users-v2')
      .query({ ...marker, platform: 'HOTMART' })
      .expect(200)

    expect(list).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      platform: 'hotmart',
    })
    expect(response.body).toEqual(enrollmentResponse)
  })

  it('preserves the exact overview analytics envelope', async () => {
    const get = jest.fn().mockResolvedValue(analyticsResponse)
    const response = await request(createTestApp(withValidatedInput(
      usersV2OverviewAnalyticsInput,
      createUsersV2OverviewAnalyticsController({ get }),
    )))
      .get('/users-v2')
      .query(marker)
      .expect(200)

    expect(get).toHaveBeenCalledWith()
    expect(response.body).toEqual(analyticsResponse)
  })

  it('passes the translated legacy DTO and preserves its exact envelope', async () => {
    const list = jest.fn().mockResolvedValue(legacyResponse)
    const response = await request(createTestApp(withValidatedInput(
      usersV2LegacyInput,
      createUsersV2LegacyController({ list }),
    )))
      .get('/users-v2')
      .query({ ...marker, topPercentage: '10', ignored: 'legacy' })
      .expect(200)

    expect(list).toHaveBeenCalledWith({
      canonical: {
        page: 1,
        limit: 50,
        minEngagement: 77,
      },
      responseFilters: {
        topPercentage: '10',
      },
    })
    expect(response.body).toEqual(legacyResponse)
  })

  it.each([
    {
      name: 'enrollments',
      code: 'USERS_V2_ENROLLMENTS_FAILED',
      message: 'Erro ao listar matrículas de utilizadores',
      handler: () => withValidatedInput(
        usersV2EnrollmentInput,
        createUsersV2EnrollmentController({
          list: jest.fn().mockRejectedValue(
            new Error('falha alice@example.test token=segredo'),
          ),
        }),
      ),
    },
    {
      name: 'analytics',
      code: 'USERS_V2_ANALYTICS_FAILED',
      message: 'Erro ao calcular analytics de utilizadores',
      handler: () => withValidatedInput(
        usersV2OverviewAnalyticsInput,
        createUsersV2OverviewAnalyticsController({
          get: jest.fn().mockRejectedValue(
            new Error('falha alice@example.test token=segredo'),
          ),
        }),
      ),
    },
    {
      name: 'legacy',
      code: 'USERS_V2_LEGACY_FAILED',
      message: 'Erro ao listar utilizadores',
      handler: () => withValidatedInput(
        usersV2LegacyInput,
        createUsersV2LegacyController({
          list: jest.fn().mockRejectedValue(
            new Error('falha alice@example.test token=segredo'),
          ),
        }),
      ),
    },
  ])(
    'keeps $name dependency detail in one central redacted log event',
    async ({ code, message, handler }) => {
      const logError = jest.fn<void, [ErrorLogEvent]>()
      const response = await request(createTestApp(handler(), logError))
        .get('/users-v2')
        .query(marker)
        .expect(500)

      expect(response.headers['x-request-id']).toBe(
        'users-v2-list-request-id',
      )
      expect(response.body).toEqual({
        success: false,
        code,
        message,
        correlationId: 'users-v2-list-request-id',
      })
      expect(JSON.stringify(response.body)).not.toContain('alice')
      expect(JSON.stringify(response.body)).not.toContain('segredo')
      expect(logError).toHaveBeenCalledTimes(1)
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        correlationId: 'users-v2-list-request-id',
        code,
        detail: 'falha [REDACTED_EMAIL] token=[REDACTED]',
      }))
    },
  )
})

describe('users V2 list runtime composition', () => {
  it('does not query or connect while importing the runtime', async () => {
    const aggregate = jest.fn()
    const userProductFind = jest.fn()
    const productFind = jest.fn()
    const userFind = jest.fn()
    const groupedList = jest.fn()
    const connect = jest.spyOn(mongoose, 'connect')

    jest.doMock('../../src/models/UserProduct', () => ({
      __esModule: true,
      default: {
        collection: { name: 'userproducts' },
        aggregate,
        find: userProductFind,
      },
    }))
    jest.doMock('../../src/models/product/Product', () => ({
      __esModule: true,
      default: {
        collection: { name: 'products' },
        find: productFind,
      },
    }))
    jest.doMock('../../src/models/user', () => ({
      __esModule: true,
      default: {
        collection: { name: 'users' },
        find: userFind,
      },
    }))
    jest.doMock('../../src/services/userProducts/userProductService', () => ({
      __esModule: true,
      getUsersForProduct: groupedList,
    }))

    const runtime = await import(
      '../../src/services/users/usersV2List.runtime'
    )

    expect(runtime.getUsersV2Enrollments).toEqual(expect.any(Function))
    expect(runtime.getUsersV2OverviewAnalytics).toEqual(expect.any(Function))
    expect(runtime.getUsersV2Legacy).toEqual(expect.any(Function))
    expect(aggregate).not.toHaveBeenCalled()
    expect(userProductFind).not.toHaveBeenCalled()
    expect(productFind).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
    expect(groupedList).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()

    connect.mockRestore()
  })
})
