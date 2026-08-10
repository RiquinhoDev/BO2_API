import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createClassComparisonController } from '../../src/controllers/analytics/classComparison.controller'
import { classComparisonInput } from '../../src/security/classComparisonInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  ClassComparisonData,
  ClassComparisonResult,
  ClassComparisonService,
} from '../../src/services/analytics/classComparison.service'

installTestRuntimeConfigHooks()

type ComparisonService = Pick<ClassComparisonService, 'compare'>

const comparisonData: ClassComparisonData = {
  comparisons: [
    {
      classId: 'class-a',
      className: 'Class A',
      totalStudents: 10,
      activeStudents: 5,
      averageEngagement: 40,
      healthScore: 50,
      averageProgress: 30,
      lastCalculated: new Date(700).toISOString(),
    },
    {
      classId: 'missing',
      totalStudents: 0,
      activeStudents: 0,
      averageEngagement: 0,
      healthScore: 0,
      averageProgress: 0,
      lastCalculated: '',
      error: 'Turma não encontrada',
    },
  ],
  summary: {
    totalStudentsSum: 10,
    averageEngagementMean: 40,
    healthScoreMean: 50,
    bestPerformingClass: {
      classId: 'class-a',
      className: 'Class A',
      totalStudents: 10,
      activeStudents: 5,
      averageEngagement: 40,
      healthScore: 50,
      averageProgress: 30,
      lastCalculated: new Date(700).toISOString(),
    },
    worstPerformingClass: {
      classId: 'class-a',
      className: 'Class A',
      totalStudents: 10,
      activeStudents: 5,
      averageEngagement: 40,
      healthScore: 50,
      averageProgress: 30,
      lastCalculated: new Date(700).toISOString(),
    },
  },
  validComparisons: 1,
  totalRequested: 2,
  calculationDuration: 25,
  lastUpdated: new Date(1_025).toISOString(),
  cached: false,
}

const fixedService = (
  result: ClassComparisonResult,
): ComparisonService => ({
  compare: jest.fn().mockResolvedValue(result),
})

const createTestApp = (service: ComparisonService) => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'class-comparison-request-id',
    logError: jest.fn(),
  })

  app.use(errors.correlationId)
  app.get(
    '/compare',
    withValidatedInput(
      classComparisonInput,
      createClassComparisonController(service),
    ),
  )
  app.use(errors.handler)

  return app
}

describe('classComparison controller', () => {
  it('preserves the fresh response envelope and visible cache state', async () => {
    const response = await request(createTestApp(fixedService({
      found: true,
      data: comparisonData,
      timestamp: 1_025,
    })))
      .get('/compare?classIds=class-a,missing&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: comparisonData,
      cached: false,
      timestamp: new Date(1_025).toISOString(),
      calculationDuration: 25,
    })
  })

  it('preserves the cache-hit envelope and exposes cached inside data', async () => {
    const cachedData = {
      ...comparisonData,
      cached: true,
    }
    const response = await request(createTestApp(fixedService({
      found: true,
      data: cachedData,
      timestamp: 1_025,
      cacheAge: 30,
    })))
      .get('/compare?classIds=class-a,missing&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: cachedData,
      cached: true,
      timestamp: new Date(1_025).toISOString(),
      cacheAge: 30,
    })
  })

  it('preserves the not-found response when every class is invalid', async () => {
    const response = await request(createTestApp(fixedService({
      found: false,
    })))
      .get('/compare?classIds=missing,failed&__bo2_offline_loopback=1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      success: false,
      message: 'Nenhuma turma válida encontrada para comparação',
    })
  })

  it('uses the central error envelope without exposing service detail', async () => {
    const service: ComparisonService = {
      compare: jest.fn().mockRejectedValue(
        new Error('database-secret-detail'),
      ),
    }
    const response = await request(createTestApp(service))
      .get('/compare?classIds=class-a,class-b&__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'CLASS_COMPARISON_READ_FAILED',
      message: 'Erro ao comparar turmas',
      correlationId: 'class-comparison-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
