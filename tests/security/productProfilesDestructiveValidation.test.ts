import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const deleteProductProfile = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/products/productProfile.controller', () => ({
  __esModule: true,
  getAllProductProfiles: noop,
  getProductProfileByCode: noop,
  getProductProfileStats: noop,
  createProductProfile: noop,
  duplicateProductProfile: noop,
  updateProductProfile: noop,
  deleteProductProfile,
}))

import productProfileRouter from '../../src/routes/productProfile.routes'

const marker = { __bo2_offline_loopback: '1' }
const path = '/api/product-profiles/OGI-COURSE?hardDelete=true'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'product-profile-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/product-profiles', productProfileRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown> = {}) {
  const pending = request(buildApp())
    .delete(`${path}&__bo2_offline_loopback=${marker.__bo2_offline_loopback}`)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test('accepts a business code and forwards hardDelete', async () => {
  deleteProductProfile.mockClear()

  await callRoute().expect(204)

  expect(deleteProductProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { code: 'OGI-COURSE' },
      query: { hardDelete: 'true' },
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

test('rejects an invalid hardDelete query', async () => {
  await request(buildApp())
    .delete('/api/product-profiles/OGI-COURSE')
    .query({ ...marker, hardDelete: 'yes' })
    .expect(400)
})
