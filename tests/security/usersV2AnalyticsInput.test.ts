import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  usersV2ComparisonInput,
  usersV2StatsInput,
} from '../../src/security/usersV2AnalyticsInput'
import {
  withValidatedInput,
  type ValidatedInputHandler,
} from '../../src/security/validatedInput'

const createTestApp = (
  schema: typeof usersV2StatsInput,
  handler: ValidatedInputHandler<typeof usersV2StatsInput> = (
    input,
    _req,
    res,
  ) => {
    res.status(200).json(input)
  },
) => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-input-request-id',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)
  app.all('/users-v2', withValidatedInput(schema, handler))
  app.use(errors.handler)

  return app
}

describe.each([
  ['stats', usersV2StatsInput],
  ['comparison', usersV2ComparisonInput],
] as const)('%s users V2 analytics input', (_name, schema) => {
  it('accepts only empty input after removing the offline marker', async () => {
    const response = await request(createTestApp(schema))
      .get('/users-v2?__bo2_offline_loopback=1')

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
    'filter.name=unsafe',
  ])('rejects hostile or unexpected query input: %s', async query => {
    const response = await request(createTestApp(schema))
      .get(`/users-v2?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'users-v2-input-request-id',
    })
  })

  it('rejects an own __proto__ key without polluting Object.prototype', async () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

    const response = await request(createTestApp(schema))
      .post('/users-v2?__bo2_offline_loopback=1')
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

it('keeps stats and comparison schemas independently extensible', async () => {
  expect(usersV2StatsInput).not.toBe(usersV2ComparisonInput)

  const statsInputWithScope = usersV2StatsInput.extend({
    query: z.object({ scope: z.literal('all') }).strict(),
  })
  const statsResponse = await request(createTestApp(statsInputWithScope))
    .get('/users-v2?scope=all&__bo2_offline_loopback=1')
  const comparisonResponse = await request(
    createTestApp(usersV2ComparisonInput),
  ).get('/users-v2?scope=all&__bo2_offline_loopback=1')

  expect(statsResponse.status).toBe(200)
  expect(statsResponse.body.query).toEqual({ scope: 'all' })
  expect(comparisonResponse.status).toBe(400)
  expect(comparisonResponse.body).toMatchObject({
    success: false,
    code: 'INVALID_REQUEST',
  })
})
