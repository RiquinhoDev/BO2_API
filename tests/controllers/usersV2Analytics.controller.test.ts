import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import {
  createUsersV2ComparisonController,
  createUsersV2StatsController,
} from '../../src/controllers/users/usersV2Analytics.controller'
import {
  createErrorHandling,
  type ErrorLogEvent,
} from '../../src/security/errorHandling'
import {
  usersV2ComparisonInput,
  usersV2StatsInput,
} from '../../src/security/usersV2AnalyticsInput'
import {
  withValidatedInput,
  type ValidatedInputHandler,
} from '../../src/security/validatedInput'
import type {
  UsersV2ComparisonResult,
  UsersV2ComparisonService,
  UsersV2StatsResult,
  UsersV2StatsService,
} from '../../src/services/users/usersV2Analytics.service'

type StatsService = Pick<UsersV2StatsService, 'get'>
type ComparisonService = Pick<UsersV2ComparisonService, 'get'>

const statsResult: UsersV2StatsResult = {
  success: true,
  data: {
    overview: {
      totalStudents: 2,
      avgEngagement: 55,
      avgProgress: 60,
      activeCount: 2,
      activeRate: 100,
      atRiskCount: 1,
      atRiskRate: 50,
      activeProducts: 1,
      healthScore: 70,
      healthLevel: 'RAZOÁVEL',
      healthBreakdown: {
        engagement: 55,
        retention: 100,
        growth: 0,
        progress: 60,
      },
    },
    byPlatform: [
      {
        name: 'Hotmart',
        count: 2,
        percentage: 100,
        icon: 'ðŸ”¥',
      },
    ],
    quickFilters: {
      atRisk: 1,
      topPerformers: 1,
      inactive30d: 0,
      new7d: 0,
    },
    meta: {
      calculatedAt: '2026-07-30T12:00:00.000Z',
      durationMs: 0,
    },
  },
}

const comparisonResult: UsersV2ComparisonResult[] = [{
  productId: 'product-1',
  productName: 'Product One',
  platform: 'hotmart',
  totalStudents: 2,
  avgScore: 55,
  trend: 0,
  distribution: {
    alto: { count: 1, percentage: 50 },
    medio: { count: 0, percentage: 0 },
    baixo: { count: 0, percentage: 0 },
    risco: { count: 1, percentage: 50 },
  },
}]

function createTestApp<TSchema extends typeof usersV2StatsInput>(
  schema: TSchema,
  controller: ValidatedInputHandler<TSchema>,
  logError: (event: ErrorLogEvent) => void = jest.fn(),
) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-analytics-request-id',
    logError,
  })

  app.use(errors.correlationId)
  app.get('/users-v2', withValidatedInput(schema, controller))
  app.use(errors.handler)

  return app
}

describe('users V2 analytics controllers', () => {
  it('preserves the stats service success envelope', async () => {
    const service: StatsService = {
      get: jest.fn().mockResolvedValue(statsResult),
    }
    const response = await request(createTestApp(
      usersV2StatsInput,
      createUsersV2StatsController(service),
    )).get('/users-v2?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(statsResult)
  })

  it('wraps the comparison service result in the compatible envelope', async () => {
    const service: ComparisonService = {
      get: jest.fn().mockResolvedValue(comparisonResult),
    }
    const response = await request(createTestApp(
      usersV2ComparisonInput,
      createUsersV2ComparisonController(service),
    )).get('/users-v2?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: comparisonResult,
    })
  })

  it.each([
    {
      name: 'stats',
      code: 'USERS_V2_STATS_FAILED',
      message: 'Erro ao calcular stats',
      schema: usersV2StatsInput,
      createController: () => createUsersV2StatsController({
        get: jest.fn().mockRejectedValue(
          new Error('stats-database-secret-detail'),
        ),
      }),
      detail: 'stats-database-secret-detail',
    },
    {
      name: 'comparison',
      code: 'USERS_V2_COMPARISON_FAILED',
      message: 'Erro ao calcular comparação de engagement',
      schema: usersV2ComparisonInput,
      createController: () => createUsersV2ComparisonController({
        get: jest.fn().mockRejectedValue(
          new Error('comparison-database-secret-detail'),
        ),
      }),
      detail: 'comparison-database-secret-detail',
    },
  ])(
    'keeps $name dependency detail in one log event and out of the response',
    async ({ code, message, schema, createController, detail }) => {
      const logError = jest.fn<void, [ErrorLogEvent]>()
      const response = await request(createTestApp(
        schema,
        createController(),
        logError,
      )).get('/users-v2?__bo2_offline_loopback=1')

      expect(response.status).toBe(500)
      expect(response.headers['x-request-id']).toBe(
        'users-v2-analytics-request-id',
      )
      expect(response.body).toEqual({
        success: false,
        code,
        message,
        correlationId: 'users-v2-analytics-request-id',
      })
      expect(JSON.stringify(response.body)).not.toContain(detail)
      expect(logError).toHaveBeenCalledTimes(1)
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        correlationId: 'users-v2-analytics-request-id',
        code,
        detail,
      }))
    },
  )
})

describe('users V2 analytics runtime composition', () => {
  it('does not query or connect while importing the runtime', async () => {
    const aggregate = jest.fn()
    const userProductFind = jest.fn()
    const productFind = jest.fn()
    const userFind = jest.fn()
    const connect = jest.spyOn(mongoose, 'connect')

    jest.doMock('../../src/models/UserProduct', () => ({
      __esModule: true,
      default: {
        aggregate,
        find: userProductFind,
      },
    }))
    jest.doMock('../../src/models/product/Product', () => ({
      __esModule: true,
      default: {
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

    const runtime = await import(
      '../../src/services/users/usersV2Analytics.runtime'
    )

    expect(runtime.getUsersV2Stats).toEqual(expect.any(Function))
    expect(runtime.getUsersV2Comparison).toEqual(expect.any(Function))

    expect(aggregate).not.toHaveBeenCalled()
    expect(userProductFind).not.toHaveBeenCalled()
    expect(productFind).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()

    connect.mockRestore()
  })
})
