import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import {
  createClassAnalyticsController,
  type ClassAnalyticsService,
} from '../../src/controllers/analytics/classAnalytics.controller'
import {
  classAnalyticsClassInput,
  classAnalyticsEmptyInput,
  classAnalyticsQueryInput,
} from '../../src/security/classAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { IClassAnalytics } from '../../src/types/analytics.types'

installTestRuntimeConfigHooks()

const createAnalytics = (): IClassAnalytics => ({
  classId: 'class-1',
  className: 'Turma Um',
  totalStudents: 20,
  activeStudents: 15,
  inactiveStudents: 5,
  averageEngagement: 72,
  engagementDistribution: {
    muito_alto: 2,
    alto: 8,
    medio: 5,
    baixo: 3,
    muito_baixo: 2,
  },
  averageProgress: 64,
  progressDistribution: {
    completed: 2,
    advanced: 5,
    intermediate: 7,
    beginner: 4,
    minimal: 2,
  },
  averageAccessCount: 12,
  activityDistribution: {
    very_active: 2,
    active: 6,
    moderate: 7,
    low: 3,
    inactive: 2,
  },
  lastAccess: {
    today: 3,
    week: 8,
    month: 6,
    older: 3,
  },
  healthScore: 78,
  healthFactors: {
    engagement: 72,
    activity: 75,
    progress: 64,
    retention: 80,
  },
  alerts: [{
    type: 'warning',
    message: 'Atenção à retenção',
    priority: 'medium',
    category: 'retention',
  }],
  lastCalculatedAt: new Date(),
  calculationDuration: 125,
  studentsProcessed: 20,
  dataVersion: '1.0.0',
})

const createService = (): jest.Mocked<ClassAnalyticsService> => ({
  getClassAnalytics: jest.fn(),
  recalculateClass: jest.fn(),
  getClassesThatNeedUpdate: jest.fn(),
})

const createTestApp = (service: ClassAnalyticsService) => {
  const app = express()
  const controller = createClassAnalyticsController(service)
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'analytics-request-id',
    logError: jest.fn(),
  })

  app.use(errorHandling.correlationId)
  app.get(
    '/class/:classId',
    withValidatedInput(
      classAnalyticsQueryInput,
      controller.getClassAnalytics,
    ),
  )
  app.post(
    '/class/:classId/recalculate',
    withValidatedInput(
      classAnalyticsClassInput,
      controller.recalculateClassScores,
    ),
  )
  app.get(
    '/class/:classId/health',
    withValidatedInput(classAnalyticsClassInput, controller.getHealthScore),
  )
  app.get(
    '/class/:classId/engagement',
    withValidatedInput(
      classAnalyticsClassInput,
      controller.getEngagementDistribution,
    ),
  )
  app.get(
    '/class/:classId/alerts',
    withValidatedInput(classAnalyticsClassInput, controller.getClassAlerts),
  )
  app.get(
    '/outdated',
    withValidatedInput(
      classAnalyticsEmptyInput,
      controller.getOutdatedClasses,
    ),
  )
  app.use(errorHandling.handler)

  return app
}

describe('classAnalytics controller', () => {
  it('preserves class analytics and forwards force=true', async () => {
    const analytics = createAnalytics()
    const service = createService()
    service.getClassAnalytics.mockResolvedValue(analytics)

    const response = await request(createTestApp(service))
      .get('/class/class-1?force=true&__bo2_offline_loopback=1')

    expect(service.getClassAnalytics).toHaveBeenCalledWith('class-1', true)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        ...analytics,
        lastCalculatedAt: analytics.lastCalculatedAt.toISOString(),
      },
      meta: {
        cached: false,
        cacheAge: 0,
        lastCalculated: analytics.lastCalculatedAt.toISOString(),
        calculationDuration: analytics.calculationDuration,
        studentsProcessed: analytics.studentsProcessed,
      },
      timestamp: expect.any(String),
    })
  })

  it('keeps recalculation disabled when force is absent', async () => {
    const analytics = createAnalytics()
    const service = createService()
    service.getClassAnalytics.mockResolvedValue(analytics)

    const response = await request(createTestApp(service))
      .get('/class/class-1?__bo2_offline_loopback=1')

    expect(service.getClassAnalytics).toHaveBeenCalledWith('class-1', false)
    expect(response.status).toBe(200)
    expect(response.body.meta.cached).toBe(true)
  })

  it('preserves the class-not-found response', async () => {
    const service = createService()
    service.getClassAnalytics.mockResolvedValue(null)

    const response = await request(createTestApp(service))
      .get('/class/missing?__bo2_offline_loopback=1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      success: false,
      message: 'Turma não encontrada',
    })
  })

  it('preserves the recalculation response', async () => {
    const analytics = createAnalytics()
    const service = createService()
    service.recalculateClass.mockResolvedValue(analytics)

    const response = await request(createTestApp(service))
      .post('/class/class-1/recalculate?__bo2_offline_loopback=1')

    expect(service.recalculateClass).toHaveBeenCalledWith('class-1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      message: 'Analytics recalculados com sucesso para a turma class-1',
      data: {
        classId: 'class-1',
        studentsProcessed: 20,
        calculationDuration: 125,
        newAverageEngagement: 72,
        newHealthScore: 78,
      },
      timestamp: expect.any(String),
    })
  })

  it('preserves the outdated classes envelope', async () => {
    const service = createService()
    service.getClassesThatNeedUpdate.mockResolvedValue(['class-1', 'class-2'])

    const response = await request(createTestApp(service))
      .get('/outdated?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        count: 2,
        classes: ['class-1', 'class-2'],
      },
      message: '2 turmas precisam de atualização',
      timestamp: expect.any(String),
    })
  })

  it('preserves health, engagement and alert projections', async () => {
    const analytics = createAnalytics()
    const service = createService()
    service.getClassAnalytics.mockResolvedValue(analytics)
    const app = createTestApp(service)

    const [health, engagement, alerts] = await Promise.all([
      request(app).get('/class/class-1/health?__bo2_offline_loopback=1'),
      request(app).get('/class/class-1/engagement?__bo2_offline_loopback=1'),
      request(app).get('/class/class-1/alerts?__bo2_offline_loopback=1'),
    ])

    expect(health.status).toBe(200)
    expect(health.body.data).toEqual({
      classId: 'class-1',
      className: 'Turma Um',
      healthScore: 78,
      healthFactors: analytics.healthFactors,
      totalStudents: 20,
      lastCalculated: analytics.lastCalculatedAt.toISOString(),
    })
    expect(engagement.status).toBe(200)
    expect(engagement.body.data).toEqual({
      classId: 'class-1',
      className: 'Turma Um',
      totalStudents: 20,
      averageEngagement: 72,
      distribution: analytics.engagementDistribution,
      lastCalculated: analytics.lastCalculatedAt.toISOString(),
    })
    expect(alerts.status).toBe(200)
    expect(alerts.body.data).toEqual({
      classId: 'class-1',
      className: 'Turma Um',
      totalAlerts: 1,
      alerts: analytics.alerts,
      lastCalculated: analytics.lastCalculatedAt.toISOString(),
    })
  })

  it('uses the central error envelope without exposing service detail', async () => {
    const service = createService()
    service.getClassAnalytics.mockRejectedValue(
      new Error('database-secret-detail'),
    )

    const response = await request(createTestApp(service))
      .get('/class/class-1?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'CLASS_ANALYTICS_READ_FAILED',
      message: 'Erro interno do servidor ao buscar analytics da turma',
      correlationId: 'analytics-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
