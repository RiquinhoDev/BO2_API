import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createBenchmarkAnalyticsController } from '../../src/controllers/analytics/benchmarkAnalytics.controller'
import { benchmarkAnalyticsInput } from '../../src/security/benchmarkAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  BenchmarkAnalyticsResult,
  BenchmarkAnalyticsService,
  BenchmarksResult,
  EmptyBenchmarksResult,
} from '../../src/services/analytics/benchmarkAnalytics.service'

installTestRuntimeConfigHooks()

type BenchmarkService = Pick<BenchmarkAnalyticsService, 'get'>

const populatedData: BenchmarksResult = {
  benchmarks: {
    engagement: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    progress: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    activityRate: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    classSize: { large: 100, medium: 50, small: 25 },
  },
  industryStats: {
    totalClasses: 1,
    totalStudents: 10,
    averageClassSize: 10,
    overallEngagement: 80,
    overallProgress: 75,
    overallActivityRate: 90,
  },
  topPerformers: [],
  needsAttention: [],
  insights: [],
  metadata: {
    calculationDate: '2026-07-29T10:00:00.025Z',
    classesAnalyzed: 1,
    calculationDuration: 25,
    dataFreshness: 'Calculado em tempo real',
  },
}

const fixedService = (
  result: BenchmarkAnalyticsResult,
): BenchmarkService => ({
  get: jest.fn().mockResolvedValue(result),
})

const createTestApp = (service: BenchmarkService) => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'benchmark-request-id',
    logError: jest.fn(),
  })

  app.use(errors.correlationId)
  app.get(
    '/benchmarks',
    withValidatedInput(
      benchmarkAnalyticsInput,
      createBenchmarkAnalyticsController(service),
    ),
  )
  app.use(errors.handler)

  return app
}

describe('benchmark analytics controller', () => {
  it('preserves the populated response envelope', async () => {
    const service = fixedService({
      empty: false,
      data: populatedData,
      timestamp: Date.parse('2026-07-29T10:00:00.025Z'),
    })
    const response = await request(createTestApp(service))
      .get('/benchmarks?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: populatedData,
      timestamp: '2026-07-29T10:00:00.025Z',
    })
    expect(service.get).toHaveBeenCalledTimes(1)
  })

  it.each<EmptyBenchmarksResult>([
    {
      message: 'Nenhuma turma ativa encontrada para calcular benchmarks',
      totalClasses: 0,
    },
    {
      message: 'Nenhuma turma com dados válidos encontrada',
      totalClasses: 0,
    },
  ])('preserves the empty response without synthetic metadata', async (data) => {
    const response = await request(createTestApp(fixedService({
      empty: true,
      data,
    })))
      .get('/benchmarks?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data,
    })
  })

  it('uses the central error envelope without exposing dependency detail', async () => {
    const service: BenchmarkService = {
      get: jest.fn().mockRejectedValue(
        new Error('database-secret-detail'),
      ),
    }
    const response = await request(createTestApp(service))
      .get('/benchmarks?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'ANALYTICS_BENCHMARKS_READ_FAILED',
      message: 'Erro ao calcular benchmarks da indústria',
      correlationId: 'benchmark-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
