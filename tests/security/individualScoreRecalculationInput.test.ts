import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createIndividualScoreRecalculationController } from '../../src/controllers/analytics/individualScoreRecalculation.controller'
import { createErrorHandling } from '../../src/security/errorHandling'
import { individualScoreRecalculationInput } from '../../src/security/individualScoreRecalculationInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { IndividualScoreRecalculationService } from '../../src/services/analytics/individualScoreRecalculation.service'

installTestRuntimeConfigHooks()

type Recalculate = IndividualScoreRecalculationService['recalculate']

function serviceSpy() {
  return jest
    .fn<ReturnType<Recalculate>, Parameters<Recalculate>>()
    .mockResolvedValue({ kind: 'not-found' })
}

function buildApp(recalculate: jest.MockedFunction<Recalculate>) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'input-correlation-id',
    logError: () => undefined,
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

const offlineMarker = { __bo2_offline_loopback: '1' }

describe('individual score recalculation input', () => {
  it('decodes the class ID and removes the offline marker before service input', async () => {
    const recalculate = serviceSpy()

    await request(buildApp(recalculate))
      .post('/recalculate/class%2Fa')
      .query(offlineMarker)
      .send({})
      .expect(404)

    expect(recalculate).toHaveBeenCalledTimes(1)
    expect(recalculate).toHaveBeenCalledWith('class/a')
  })

  it.each([
    ['a blank class ID', '/recalculate/%20%20%20'],
    ['a 257-character class ID', `/recalculate/${'x'.repeat(257)}`],
  ])('rejects %s without calling the service', async (_case, path) => {
    const recalculate = serviceSpy()

    await request(buildApp(recalculate))
      .post(path)
      .query(offlineMarker)
      .send({})
      .expect(400)

    expect(recalculate).not.toHaveBeenCalled()
  })

  it('rejects an extra query field without calling the service', async () => {
    const recalculate = serviceSpy()

    await request(buildApp(recalculate))
      .post('/recalculate/class-safe')
      .query({ ...offlineMarker, unexpected: 'value' })
      .send({})
      .expect(400)

    expect(recalculate).not.toHaveBeenCalled()
  })

  it('rejects an extra body field without calling the service', async () => {
    const recalculate = serviceSpy()

    await request(buildApp(recalculate))
      .post('/recalculate/class-safe')
      .query(offlineMarker)
      .send({ unexpected: 'value' })
      .expect(400)

    expect(recalculate).not.toHaveBeenCalled()
  })

  it.each([
    ['$where', { $where: 'return true' }],
    ['a dotted key', { 'filter.name': 'unsafe' }],
  ])('rejects %s in the query without calling the service', async (_case, query) => {
    const recalculate = serviceSpy()

    await request(buildApp(recalculate))
      .post('/recalculate/class-safe')
      .query({ ...offlineMarker, ...query })
      .send({})
      .expect(400)

    expect(recalculate).not.toHaveBeenCalled()
  })

  it('rejects a literal JSON __proto__ key without calling the service', async () => {
    const recalculate = serviceSpy()
    const payload = JSON.parse('{"__proto__":{"polluted":true}}')

    expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

    await request(buildApp(recalculate))
      .post('/recalculate/class-safe')
      .query(offlineMarker)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(400)

    expect(recalculate).not.toHaveBeenCalled()
  })
})
