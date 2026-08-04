import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { classComparisonInput } from '../../src/security/classComparisonInput'
import { createErrorHandling } from '../../src/security/errorHandling'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'class-comparison-input-id',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)
  app.all(
    '/compare',
    withValidatedInput(
      classComparisonInput,
      (input, _req, res) => {
        res.json(input)
      },
    ),
  )
  app.use(errors.handler)

  return app
}

describe('classComparisonInput', () => {
  it('normalizes the ordered class identifiers', async () => {
    const response = await request(createTestApp())
      .get(
        '/compare?classIds=%20class-a%20,,class-b&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      params: {},
      query: { classIds: ['class-a', 'class-b'] },
      body: {},
    })
  })

  it.each([
    '/compare',
    '/compare?classIds=only-one',
    '/compare?classIds=1,2,3,4,5,6,7,8,9,10,11',
    '/compare?classIds=a,b&extra=value',
    '/compare?classIds=a,b&%24where=return%20true',
  ])('rejects invalid comparison input: %s', async (path) => {
    const response = await request(createTestApp()).get(
      `${path}${path.includes('?') ? '&' : '?'}__bo2_offline_loopback=1`,
    )

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

    const response = await request(createTestApp())
      .post('/compare?classIds=a,b&__bo2_offline_loopback=1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload))

    expect(response.status).toBe(400)
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted'))
      .toBeUndefined()
  })
})
