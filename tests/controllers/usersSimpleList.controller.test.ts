import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createUsersSimpleListController } from '../../src/controllers/usersSimpleList.controller'
import { createErrorHandling } from '../../src/security/errorHandling'
import { usersSimpleListInput } from '../../src/security/usersSimpleListInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { UsersSimpleListService } from '../../src/services/users/usersSimpleList.service'

installTestRuntimeConfigHooks()

const result = {
  users: [],
  count: 401,
  page: 2,
  limit: 200,
  totalPages: 3,
  pagination: {
    page: 2,
    limit: 200,
    total: 401,
    pages: 3,
  },
}

const createTestApp = (service: Pick<UsersSimpleListService, 'list'>) => {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'request-id',
    logError: jest.fn(),
  })
  app.use(errorHandling.correlationId)
  app.get(
    '/users',
    withValidatedInput(
      usersSimpleListInput,
      createUsersSimpleListController(service),
    ),
  )
  app.use(errorHandling.handler)
  return app
}

describe('usersSimpleList controller', () => {
  it('delegates validated input and returns legacy plus canonical metadata', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(result),
    }

    const response = await request(createTestApp(service))
      .get('/users?page=2&limit=10000&status=active&__bo2_offline_loopback=1')

    expect(service.list).toHaveBeenCalledWith({
      page: '2',
      limit: '10000',
      status: 'active',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: result.users,
      meta: result.pagination,
    })
  })

  it('passes failures to the central handler without exposing detail', async () => {
    const service = {
      list: jest.fn().mockRejectedValue(new Error('database-secret-detail')),
    }

    const response = await request(createTestApp(service))
      .get('/users?__bo2_offline_loopback=1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      correlationId: 'request-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('database-secret-detail')
  })
})
