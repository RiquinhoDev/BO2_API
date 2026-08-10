import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { benchmarkAnalyticsInput } from '../../src/security/benchmarkAnalyticsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'benchmark-input-request-id',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)
  app.all(
    '/benchmarks',
    withValidatedInput(
      benchmarkAnalyticsInput,
      (input, _req, res) => {
        res.json(input)
      },
    ),
  )
  app.use(errors.handler)

  return app
}

describe('benchmarkAnalyticsInput', () => {
  it('accepts only empty input after removing the offline marker', async () => {
    const response = await request(createTestApp())
      .get('/benchmarks?__bo2_offline_loopback=1')

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
      .get(`/benchmarks?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'benchmark-input-request-id',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

    const response = await request(createTestApp())
      .post('/benchmarks?__bo2_offline_loopback=1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted'))
      .toBeUndefined()
  })
})
