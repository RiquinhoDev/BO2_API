import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { classQuickStatsInput } from '../../src/security/classQuickStatsInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'quick-stats-input-request',
    logError: jest.fn(),
  })
  const handler = withValidatedInput(
    classQuickStatsInput,
    (input, _req, res) => {
      res.json(input)
    },
  )

  app.use(express.json())
  app.use(errorHandling.correlationId)
  app.get('/class/:classId', handler)
  app.post('/class/:classId', handler)
  app.use(errorHandling.handler)

  return app
}

describe('classQuickStatsInput', () => {
  it('accepts only the class identifier', async () => {
    const response = await request(createTestApp())
      .get('/class/class-1?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      params: { classId: 'class-1' },
      query: {},
      body: {},
    })
  })

  it.each([
    'extra=value',
    '%24where=return%20true',
  ])('rejects unexpected query input: %s', async (query) => {
    const response = await request(createTestApp())
      .get(`/class/class-1?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'quick-stats-input-request',
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
