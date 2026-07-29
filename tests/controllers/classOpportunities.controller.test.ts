import express from 'express'
import request from 'supertest'
import { createClassOpportunitiesController } from '../../src/controllers/analytics/classOpportunities.controller'
import { classAnalyticsClassInput } from '../../src/security/classAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  ClassOpportunitiesData,
  ClassOpportunitiesResult,
  ClassOpportunitiesService,
} from '../../src/services/analytics/classOpportunities.service'

type OpportunitiesService = Pick<ClassOpportunitiesService, 'getForClass'>

const opportunityData: ClassOpportunitiesData = {
  classId: 'class-a',
  className: 'Class A',
  totalOpportunities: 1,
  opportunities: [
    {
      type: 'engagement',
      priority: 'high',
      title: 'Engagement Baixo',
      description: 'Descrição pública',
      suggestion: 'Sugestão pública',
      impact: 'Alto',
    },
  ],
  classMetrics: {
    totalStudents: 10,
    activeStudents: 5,
    averageEngagement: 20,
    healthScore: 30,
    averageProgress: 20,
  },
  summary: {
    highPriority: 1,
    mediumPriority: 0,
    lowPriority: 0,
    positiveInsights: 0,
  },
  analysisDate: '2026-07-29T13:00:00.000Z',
}

const fixedService = (
  result: ClassOpportunitiesResult,
): OpportunitiesService => ({
  getForClass: jest.fn().mockResolvedValue(result),
})

const createTestApp = (service: OpportunitiesService) => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'class-opportunities-request-id',
    logError: jest.fn(),
  })

  app.use(errors.correlationId)
  app.get(
    '/opportunities/:classId',
    withValidatedInput(
      classAnalyticsClassInput,
      createClassOpportunitiesController(service),
    ),
  )
  app.use(errors.handler)

  return app
}

describe('class opportunities controller', () => {
  it('preserves the success envelope and normalized class identifier', async () => {
    const service = fixedService({
      found: true,
      data: opportunityData,
      timestamp: Date.parse('2026-07-29T13:00:00.000Z'),
    })
    const response = await request(createTestApp(service))
      .get(
        '/opportunities/%20class-a%20?__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: opportunityData,
      timestamp: '2026-07-29T13:00:00.000Z',
    })
    expect(service.getForClass).toHaveBeenCalledWith('class-a')
  })

  it('rejects unknown query input before reading analytics', async () => {
    const service = fixedService({
      found: true,
      data: opportunityData,
      timestamp: Date.parse('2026-07-29T13:00:00.000Z'),
    })
    const response = await request(createTestApp(service))
      .get(
        '/opportunities/class-a?extra=value&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
    expect(service.getForClass).not.toHaveBeenCalled()
  })

  it('preserves the class-not-found response', async () => {
    const response = await request(createTestApp(fixedService({
      found: false,
    })))
      .get(
        '/opportunities/missing?__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      success: false,
      message: 'Turma não encontrada',
    })
  })

  it('uses the central error envelope without exposing dependency detail', async () => {
    const service: OpportunitiesService = {
      getForClass: jest.fn().mockRejectedValue(
        new Error('database-secret-detail'),
      ),
    }
    const response = await request(createTestApp(service))
      .get(
        '/opportunities/class-a?__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'CLASS_OPPORTUNITIES_READ_FAILED',
      message: 'Erro ao analisar oportunidades de melhoria',
      correlationId: 'class-opportunities-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
