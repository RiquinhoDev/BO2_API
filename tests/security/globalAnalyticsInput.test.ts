import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { globalAnalyticsInput } from '../../src/security/globalAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'global-analytics-input-request',
    logError: jest.fn(),
  })
  const handler = withValidatedInput(
    globalAnalyticsInput,
    (input, _req, res) => {
      res.json(input)
    },
  )

  app.use(express.json())
  app.use(errorHandling.correlationId)
  app.get('/global', handler)
  app.post('/global', handler)
  app.use(errorHandling.handler)

  return app
}

describe('globalAnalyticsInput', () => {
  it('accepts only an empty input', async () => {
    const response = await request(createTestApp())
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      params: {},
      query: {},
      body: {},
    })
  })

  it.each([
    'extra=value',
    '%24where=return%20true',
  ])('rejects unexpected query input: %s', async (query) => {
    const response = await request(createTestApp())
      .get(`/global?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'global-analytics-input-request',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const response = await request(createTestApp())
      .post('/global?__bo2_offline_loopback=1')
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
