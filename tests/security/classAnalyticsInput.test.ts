import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import {
  classAnalyticsClassInput,
  classAnalyticsEmptyInput,
  classAnalyticsQueryInput,
} from '../../src/security/classAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'analytics-input-request',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errorHandling.correlationId)
  app.get(
    '/class/:classId',
    withValidatedInput(classAnalyticsQueryInput, (input, _req, res) => {
      res.json(input)
    }),
  )
  app.post(
    '/class/:classId',
    withValidatedInput(classAnalyticsClassInput, (input, _req, res) => {
      res.json(input)
    }),
  )
  app.get(
    '/outdated',
    withValidatedInput(classAnalyticsEmptyInput, (input, _req, res) => {
      res.json(input)
    }),
  )
  app.use(errorHandling.handler)

  return app
}

describe('classAnalyticsInput', () => {
  it('accepts the explicit class query contract', async () => {
    const response = await request(createTestApp())
      .get('/class/class-1?force=true&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      params: { classId: 'class-1' },
      query: { force: 'true' },
      body: {},
    })
  })

  it('accepts empty class and maintenance inputs', async () => {
    const classResponse = await request(createTestApp())
      .post('/class/class-1?__bo2_offline_loopback=1')
      .send({})
    const maintenanceResponse = await request(createTestApp())
      .get('/outdated?__bo2_offline_loopback=1')

    expect(classResponse.status).toBe(200)
    expect(classResponse.body).toEqual({
      params: { classId: 'class-1' },
      query: {},
      body: {},
    })
    expect(maintenanceResponse.status).toBe(200)
    expect(maintenanceResponse.body).toEqual({
      params: {},
      query: {},
      body: {},
    })
  })

  it.each([
    'force=yes',
    'extra=value',
    '%24where=return%20true',
  ])('rejects invalid query input: %s', async (query) => {
    const response = await request(createTestApp())
      .get(`/class/class-1?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'analytics-input-request',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const response = await request(createTestApp())
      .post('/class/class-1?__bo2_offline_loopback=1')
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":true}}')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})
