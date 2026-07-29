import express from 'express'
import request from 'supertest'
import { createGlobalAnalyticsController } from '../../src/controllers/analytics/globalAnalytics.controller'
import { createErrorHandling } from '../../src/security/errorHandling'
import { globalAnalyticsInput } from '../../src/security/globalAnalyticsInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  GlobalAnalyticsData,
  GlobalAnalyticsResult,
  GlobalAnalyticsService,
} from '../../src/services/analytics/globalAnalytics.service'

type GlobalService = Pick<GlobalAnalyticsService, 'get'>

const populatedData = {
  totalClasses: 2,
  totalStudents: 3,
  activeStudents: 2,
  inactiveStudents: 1,
  activityRate: 67,
  averageEngagement: 60,
  engagementDistribution: {
    muito_alto: 1,
    alto: 0,
    medio: 1,
    baixo: 0,
    muito_baixo: 1,
  },
  calculationDuration: 10,
  lastUpdated: new Date(1_010).toISOString(),
}

const createTestApp = (service: GlobalService) => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'global-analytics-request-id',
    logError: jest.fn(),
  })

  app.use(errorHandling.correlationId)
  app.get(
    '/global',
    withValidatedInput(
      globalAnalyticsInput,
      createGlobalAnalyticsController(service),
    ),
  )
  app.use(errorHandling.handler)

  return app
}

const fixedService = (result: GlobalAnalyticsResult): GlobalService => ({
  get: jest.fn().mockResolvedValue(result),
})

describe('globalAnalytics controller', () => {
  it('preserves the fresh response envelope', async () => {
    const response = await request(createTestApp(fixedService({
      data: populatedData,
      cached: false,
      empty: false,
      timestamp: 1_010,
      calculationDuration: 10,
    })))
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: populatedData,
      cached: false,
      timestamp: new Date(1_010).toISOString(),
      calculationDuration: 10,
    })
  })

  it('preserves the cache-hit response envelope', async () => {
    const response = await request(createTestApp(fixedService({
      data: populatedData,
      cached: true,
      timestamp: 1_010,
      cacheAge: 30,
    })))
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: populatedData,
      cached: true,
      timestamp: new Date(1_010).toISOString(),
      cacheAge: 30,
    })
  })

  it('returns a complete empty data contract without synthetic metadata', async () => {
    const emptyData: GlobalAnalyticsData = {
      totalClasses: 0,
      totalStudents: 0,
      activeStudents: 0,
      inactiveStudents: 0,
      activityRate: 0,
      averageEngagement: 0,
      engagementDistribution: {
        muito_alto: 0,
        alto: 0,
        medio: 0,
        baixo: 0,
        muito_baixo: 0,
      },
      message: 'Nenhuma turma ativa encontrada',
    }
    const response = await request(createTestApp(fixedService({
      data: emptyData,
      cached: false,
      empty: true,
    })))
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: emptyData,
    })
  })

  it('uses the central error envelope without exposing service detail', async () => {
    const service: GlobalService = {
      get: jest.fn().mockRejectedValue(
        new Error('database-secret-detail'),
      ),
    }
    const response = await request(createTestApp(service))
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'GLOBAL_ANALYTICS_READ_FAILED',
      message: 'Erro ao calcular analytics globais',
      correlationId: 'global-analytics-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
