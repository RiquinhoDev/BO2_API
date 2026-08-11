import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createClassQuickStatsController } from '../../src/controllers/analytics/classQuickStats.controller'
import { createErrorHandling } from '../../src/security/errorHandling'
import { classQuickStatsInput } from '../../src/security/classQuickStatsInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { ClassQuickStatsService } from '../../src/services/analytics/classQuickStats.service'

installTestRuntimeConfigHooks()

type QuickStatsService = Pick<ClassQuickStatsService, 'get'>

const createTestApp = (
  service: QuickStatsService,
  now = () => new Date('2026-07-29T12:00:00.000Z'),
) => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'quick-stats-request-id',
    logError: jest.fn(),
  })

  app.use(errorHandling.correlationId)
  app.get(
    '/class/:classId/quick',
    withValidatedInput(
      classQuickStatsInput,
      createClassQuickStatsController(service, now),
    ),
  )
  app.use(errorHandling.handler)

  return app
}

describe('classQuickStats controller', () => {
  it('preserves the populated-class envelope and timestamp', async () => {
    const service: QuickStatsService = {
      get: jest.fn().mockResolvedValue({
        classId: 'class-1',
        totalStudents: 3,
        activeStudents: 2,
        inactiveStudents: 1,
        activityRate: 67,
      }),
    }

    const response = await request(createTestApp(service))
      .get('/class/class-1/quick?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        classId: 'class-1',
        totalStudents: 3,
        activeStudents: 2,
        inactiveStudents: 1,
        activityRate: 67,
      },
      meta: { timestamp: '2026-07-29T12:00:00.000Z' },
    })
  })

  it('preserves the empty-class envelope without a timestamp', async () => {
    const service: QuickStatsService = {
      get: jest.fn().mockResolvedValue({
        classId: 'class-empty',
        totalStudents: 0,
        activeStudents: 0,
        message: 'Turma sem alunos',
      }),
    }

    const response = await request(createTestApp(service))
      .get('/class/class-empty/quick?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        classId: 'class-empty',
        totalStudents: 0,
        activeStudents: 0,
        message: 'Turma sem alunos',
      },
    })
  })

  it('uses the central error envelope without exposing service detail', async () => {
    const service: QuickStatsService = {
      get: jest.fn().mockRejectedValue(
        new Error('database-secret-detail'),
      ),
    }

    const response = await request(createTestApp(service))
      .get('/class/class-1/quick?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'CLASS_QUICK_STATS_READ_FAILED',
      message: 'Erro ao buscar estatísticas rápidas',
      correlationId: 'quick-stats-request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'database-secret-detail',
    )
  })
})
