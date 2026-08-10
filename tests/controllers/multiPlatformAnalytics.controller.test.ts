import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createMultiPlatformAnalyticsController } from '../../src/controllers/analytics/multiPlatformAnalytics.controller'
import { createErrorHandling, type ErrorLogEvent } from '../../src/security/errorHandling'
import { multiPlatformAnalyticsInput } from '../../src/security/multiPlatformAnalyticsInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  MultiPlatformAnalyticsResult,
  MultiPlatformAnalyticsService,
} from '../../src/services/analytics/multiPlatformAnalytics.service'

installTestRuntimeConfigHooks()

type MultiPlatformService = Pick<MultiPlatformAnalyticsService, 'get'>

const result: MultiPlatformAnalyticsResult = {
  totalUsers: 12,
  activeUsers: 9,
  inactiveUsers: 3,
  platformStats: {
    hotmartUsers: 8,
    curseducaUsers: 6,
    discordUsers: 5,
    multiPlatformUsers: 4,
  },
  engagement: {
    hotmart: { total: 8, sum: 72, avg: 9 },
    curseduca: { total: 6, sum: 42, avg: 7 },
    combined: { total: 14, sum: 114, avg: 8.142857142857142 },
  },
  insights: {
    platformDiversity: '33.3% dos utilizadores estão em múltiplas plataformas',
    mostPopular: 'Hotmart',
    bestEngagement: 'Hotmart tem melhor engagement',
  },
}

const createTestApp = (
  service: MultiPlatformService,
  logError: (event: ErrorLogEvent) => void,
) => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'multi-platform-request-id',
    logError,
  })

  app.use(errors.correlationId)
  app.get(
    '/multi-platform',
    withValidatedInput(
      multiPlatformAnalyticsInput,
      createMultiPlatformAnalyticsController(service),
    ),
  )
  app.use(errors.handler)

  return app
}

describe('multi-platform analytics controller', () => {
  it('preserves the service result in the success envelope', async () => {
    const service: MultiPlatformService = {
      get: jest.fn().mockResolvedValue(result),
    }
    const response = await request(createTestApp(service, jest.fn()))
      .get('/multi-platform?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, ...result })
    expect(service.get).toHaveBeenCalledTimes(1)
  })

  it('uses the central error envelope without exposing dependency detail', async () => {
    const logError = jest.fn<void, [ErrorLogEvent]>()
    const service: MultiPlatformService = {
      get: jest.fn().mockRejectedValue(new Error('database-secret-detail')),
    }
    const response = await request(createTestApp(service, logError))
      .get('/multi-platform?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'ANALYTICS_MULTI_PLATFORM_FAILED',
      message: 'Erro ao buscar analytics',
      correlationId: 'multi-platform-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('database-secret-detail')
    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({
      detail: 'database-secret-detail',
    }))
  })
})
