import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createIndividualScoreRecalculationController } from '../../src/controllers/analytics/individualScoreRecalculation.controller'
import {
  createErrorHandling,
  type ErrorLogEvent,
} from '../../src/security/errorHandling'
import { individualScoreRecalculationInput } from '../../src/security/individualScoreRecalculationInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type {
  IndividualScoreRecalculationService,
  ScoreRecalculationOutcome,
} from '../../src/services/analytics/individualScoreRecalculation.service'

installTestRuntimeConfigHooks()

type Recalculate = IndividualScoreRecalculationService['recalculate']

function buildApp(
  recalculate: jest.MockedFunction<Recalculate>,
  logError: (event: ErrorLogEvent) => void = () => undefined,
) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'recalculation-correlation-id',
    logError,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/recalculate/:classId',
    withValidatedInput(
      individualScoreRecalculationInput,
      createIndividualScoreRecalculationController({ recalculate }),
    ),
  )
  app.use(errors.handler)

  return app
}

function fixedService(result: ScoreRecalculationOutcome) {
  return jest
    .fn<ReturnType<Recalculate>, Parameters<Recalculate>>()
    .mockResolvedValue(result)
}

const offlineMarker = { __bo2_offline_loopback: '1' }

describe('individual score recalculation controller', () => {
  it('returns the exact not-found envelope', async () => {
    const response = await request(buildApp(fixedService({
      kind: 'not-found',
    })))
      .post('/recalculate/class-empty')
      .query(offlineMarker)
      .send({})
      .expect(404)

    expect(response.body).toEqual({
      success: false,
      message: 'Nenhum aluno encontrado na turma',
    })
  })

  it('returns the exact completed envelope and a stable partial-result error', async () => {
    const completedAt = new Date('2026-07-30T12:34:56.789Z')
    const response = await request(buildApp(fixedService({
      kind: 'completed',
      classId: 'class-partial',
      totalStudents: 2,
      successfulUpdates: 1,
      failedUpdates: 1,
      calculationDuration: 42,
      completedAt,
      results: [
        {
          studentId: 'student-success',
          name: 'Success Student',
          oldScore: 15,
          newScore: 80,
          oldLevel: 'BAIXO',
          newLevel: 'ALTO',
        },
        {
          studentId: 'student-failure',
          name: 'Failure Student',
          error: 'Não foi possível atualizar o score',
        },
      ],
    })))
      .post('/recalculate/class-partial')
      .query(offlineMarker)
      .send({})
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      data: {
        classId: 'class-partial',
        totalStudents: 2,
        successfulUpdates: 1,
        failedUpdates: 1,
        results: [
          {
            studentId: 'student-success',
            name: 'Success Student',
            oldScore: 15,
            newScore: 80,
            oldLevel: 'BAIXO',
            newLevel: 'ALTO',
          },
          {
            studentId: 'student-failure',
            name: 'Failure Student',
            error: 'Não foi possível atualizar o score',
          },
        ],
      },
      meta: {
        message: 'Scores recalculados para 1 de 2 alunos',
        calculationDuration: 42,
        timestamp: '2026-07-30T12:34:56.789Z',
      },
    })
  })

  it('uses the central error envelope and redacts captured service detail', async () => {
    const events: ErrorLogEvent[] = []
    const recalculate = jest
      .fn<ReturnType<Recalculate>, Parameters<Recalculate>>()
      .mockRejectedValue(
        new Error('database private@example.test token=secret-value'),
      )

    const response = await request(buildApp(
      recalculate,
      (event) => {
        events.push(event)
      },
    ))
      .post('/recalculate/class-error')
      .query(offlineMarker)
      .send({})
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'ANALYTICS_SCORE_RECALCULATION_FAILED',
      message: 'Erro ao recalcular scores individuais da turma',
      correlationId: 'recalculation-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toMatch(
      /database|private@example\.test|token|secret-value/,
    )
    expect(events).toEqual([{
      correlationId: 'recalculation-correlation-id',
      code: 'ANALYTICS_SCORE_RECALCULATION_FAILED',
      status: 500,
      method: 'POST',
      route: '/recalculate/:classId',
      detail: 'database [REDACTED_EMAIL] token=[REDACTED]',
    }])
    expect(JSON.stringify(events)).not.toMatch(
      /private@example\.test|secret-value/,
    )
  })
})
