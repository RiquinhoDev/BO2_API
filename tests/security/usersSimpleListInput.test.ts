import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import { usersSimpleListInput } from '../../src/security/usersSimpleListInput'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

const createTestApp = () => {
  const app = express()
  const errorHandling = createErrorHandling({ logError: jest.fn() })

  app.use(errorHandling.correlationId)
  app.get(
    '/users',
    withValidatedInput(usersSimpleListInput, (input, _req, res) => {
      res.json(input.query)
    }),
  )
  app.use(errorHandling.handler)

  return app
}

describe('usersSimpleListInput', () => {
  it('accepts an empty query', async () => {
    const response = await request(createTestApp())
      .get('/users?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('accepts positive integers and a known status without clamping at the boundary', async () => {
    const response = await request(createTestApp())
      .get('/users?page=2&limit=10000&status=active&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      page: '2',
      limit: '10000',
      status: 'active',
    })
  })

  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=abc',
    'limit=0',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'status=archived',
    'unknown=value',
  ])('rejects invalid query input: %s', async (query) => {
    const response = await request(createTestApp())
      .get(`/users?${query}&__bo2_offline_loopback=1`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
  })
})
