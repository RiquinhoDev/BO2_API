import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import { multiPlatformAnalyticsInput } from '../../src/security/multiPlatformAnalyticsInput'
import { withValidatedInput } from '../../src/security/validatedInput'

const createTestApp = () => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'multi-platform-input-request-id',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)
  app.all(
    '/multi-platform',
    withValidatedInput(
      multiPlatformAnalyticsInput,
      (input, _req, res) => {
        res.json(input)
      },
    ),
  )
  app.use(errors.handler)

  return app
}

describe('multiPlatformAnalyticsInput', () => {
  it('accepts only empty input after removing the offline marker', async () => {
    const response = await request(createTestApp())
      .get('/multi-platform?__bo2_offline_loopback=1')

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
      .get(`/multi-platform?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'multi-platform-input-request-id',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

    const response = await request(createTestApp())
      .post('/multi-platform?__bo2_offline_loopback=1')
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
