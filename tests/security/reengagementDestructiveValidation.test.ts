import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const evaluateAndExecute = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/reengagement.controller', () => ({
  __esModule: true,
  evaluateStudent: noop,
  evaluateAndExecute,
  evaluateBatch: noop,
  getDecisionStats: noop,
  getStudentState: noop,
  simulateProductRun: noop,
  resetStudentState: noop,
}))

import reengagementRouter from '../../src/routes/reengagement.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'
const path = `/api/reengagement/evaluate/${objectId}/execute`

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'reengagement-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/reengagement', reengagementRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown>) {
  return request(buildApp()).post(path).query(marker).send(body)
}

test('accepts the explicit DTO and real userId', async () => {
  evaluateAndExecute.mockClear()

  await callRoute({ productCode: 'OGI', dryRun: true }).expect(204)

  expect(evaluateAndExecute).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { userId: objectId },
      query: {},
      body: { productCode: 'OGI', dryRun: true },
    }),
    expect.anything(),
  )
})

test('rejects an extra role field', async () => {
  await callRoute({
    productCode: 'OGI',
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test('rejects a nested Mongo operator', async () => {
  await callRoute({
    productCode: 'OGI',
    filter: { $where: 'unsafe' },
  }).expect(400)
})

test('rejects an invalid userId', async () => {
  await request(buildApp())
    .post('/api/reengagement/evaluate/not-an-object-id/execute')
    .query(marker)
    .send({ productCode: 'OGI' })
    .expect(400)
})
