import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { bulkOperationGuard } from '../../src/security/bulkOperationPolicy'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()

jest.mock('../../src/controllers/testHistory.controller', () => ({
  makeTestChanges: jest.fn(),
  revertTestChanges: jest.fn(),
}))

jest.mock('../../src/controllers/populateHistory.controller', () => ({
  populateRetroactiveHistory: jest.fn(),
  deleteTestEvents: jest.fn(),
  populateAllUsersHistory: jest.fn((_req, res) => res.status(204).end()),
}))

import testHistoryRouter from '../../src/routes/testHistory.routes'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'test-history-bulk-cap-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use(bulkOperationGuard)
  app.use('/api/test/history', testHistoryRouter)
  app.use(errors.handler)
  return app
}

test('populate-all-users rejects a limit above 200', async () => {
  await request(buildApp())
    .post('/api/test/history/populate-all-users')
    .query({ __bo2_offline_loopback: '1' })
    .send({ limit: 201 })
    .expect(400)
})
