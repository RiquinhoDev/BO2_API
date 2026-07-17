import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const findByIdAndDelete = jest.fn(async () => ({ _id: '507f1f77bcf86cd799439011' }))

jest.mock('../../src/models/Event', () => ({
  __esModule: true,
  default: {
    findByIdAndDelete,
  },
}))

jest.mock('../../src/models/EventType', () => ({
  __esModule: true,
  default: {},
}))

import eventsRouter from '../../src/routes/events.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'
const path = `/api/events/${objectId}`

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'events-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/events', eventsRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown> = {}) {
  const pending = request(buildApp()).delete(path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test('accepts an ObjectId and reaches the inline handler', async () => {
  findByIdAndDelete.mockClear()

  await callRoute().expect(200)

  expect(findByIdAndDelete).toHaveBeenCalledWith(objectId)
})

test('rejects an extra role field', async () => {
  await callRoute({ role: 'SUPER_ADMIN' }).expect(400)
})

test('rejects a nested Mongo operator', async () => {
  await callRoute({ filter: { $where: 'unsafe' } }).expect(400)
})

test('rejects an invalid ObjectId', async () => {
  await request(buildApp())
    .delete('/api/events/not-an-object-id')
    .query(marker)
    .expect(400)
})
