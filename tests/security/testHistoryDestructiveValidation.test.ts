import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const deleteTestEvents = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/testHistory.controller', () => ({
  makeTestChanges: noop,
  revertTestChanges: noop,
}))

jest.mock('../../src/controllers/populateHistory.controller', () => ({
  populateRetroactiveHistory: noop,
  deleteTestEvents,
  populateAllUsersHistory: noop,
}))

import testHistoryRouter from '../../src/routes/testHistory.routes'

const marker = { __bo2_offline_loopback: '1' }
const path = '/api/test/history/delete-test-events'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'test-history-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/test/history', testHistoryRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown>) {
  return request(buildApp()).post(path).query(marker).send(body)
}

test('accepts an email and forwards the DTO', async () => {
  deleteTestEvents.mockClear()

  await callRoute({ email: 'alice@example.test' }).expect(204)

  expect(deleteTestEvents).toHaveBeenCalledWith(
    expect.objectContaining({
      params: {},
      query: {},
      body: { email: 'alice@example.test' },
    }),
    expect.anything(),
  )
})

test('rejects an extra role field', async () => {
  await callRoute({
    email: 'alice@example.test',
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test('rejects a nested Mongo operator', async () => {
  await callRoute({
    email: 'alice@example.test',
    filter: { $where: 'unsafe' },
  }).expect(400)
})

test('rejects an invalid email', async () => {
  await callRoute({ email: 'not-an-email' }).expect(400)
})
