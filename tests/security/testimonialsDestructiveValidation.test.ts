import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const deleteTestimonial = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/testimonials.controller', () => ({
  getTestimonialStats: noop,
  listTestimonials: noop,
  createTestimonial: noop,
  createTestimonialRequest: noop,
  updateTestimonialStatus: noop,
  deleteTestimonial,
  getAvailableStudents: noop,
  getTestimonialReport: noop,
  getBestCandidates: noop,
  getStudentTestimonials: noop,
}))

import testimonialsRouter from '../../src/routes/testimonials.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'
const path = `/api/testimonials/${objectId}`

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'testimonials-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/testimonials', testimonialsRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown> = {}) {
  const pending = request(buildApp()).delete(path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test('accepts an ObjectId and forwards the DTO', async () => {
  deleteTestimonial.mockClear()

  await callRoute().expect(204)

  expect(deleteTestimonial).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { id: objectId },
      query: {},
      body: {},
    }),
    expect.anything(),
  )
})

test('rejects an extra role field', async () => {
  await callRoute({ role: 'SUPER_ADMIN' }).expect(400)
})

test('rejects a nested Mongo operator', async () => {
  await callRoute({ filter: { $where: 'unsafe' } }).expect(400)
})

test('rejects an invalid ObjectId', async () => {
  await request(buildApp())
    .delete('/api/testimonials/not-an-object-id')
    .query(marker)
    .expect(400)
})
