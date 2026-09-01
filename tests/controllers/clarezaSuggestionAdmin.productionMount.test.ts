import type { RequestHandler } from 'express'
import request from 'supertest'

import { createApp } from '../../src/app'
import clarezaRouter from '../../src/routes/clareza.routes'
import {
  exportCoreSuggestionsCsv,
  listCoreSuggestions,
} from '../../src/services/clareza/core/coreSuggestionAdmin.runtime'

jest.mock('../../src/services/clareza/core/coreSuggestionAdmin.runtime', () => ({
  listCoreSuggestions: jest.fn().mockResolvedValue({ page: 1, pageSize: 25, total: 0, items: [] }),
  exportCoreSuggestionsCsv: jest.fn().mockResolvedValue('"query"'),
}))

const mockedList = listCoreSuggestions as jest.MockedFunction<typeof listCoreSuggestions>
const mockedExport = exportCoreSuggestionsCsv as jest.MockedFunction<typeof exportCoreSuggestionsCsv>

const authenticateRequest: RequestHandler = (req, _res, next) => {
  req.user = {
    id: 'admin-id', email: 'admin@example.test',
    role: String(req.header('x-test-role') ?? 'MODERATOR'), permissions: [],
  }
  next()
}

function app() {
  return createApp({
    authEnforce: true,
    authenticateRequest,
    registerRoutes: instance => instance.use('/api/clareza', clarezaRouter),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('Clareza suggestion administration production mount', () => {
  it('denies a non-super-admin before store access', async () => {
    const response = await request(app())
      .get('/api/clareza/suggestions/admin?__bo2_offline_loopback=1')
      .set('x-test-role', 'ADMIN')

    expect(response.status).toBe(403)
    expect(mockedList).not.toHaveBeenCalled()
  })

  it('allows SUPER_ADMIN list and bounded CSV export', async () => {
    const listResponse = await request(app())
      .get('/api/clareza/suggestions/admin?page=1&pageSize=25&__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN')
    const exportResponse = await request(app())
      .get('/api/clareza/suggestions/admin/export?limit=200&__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN')

    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toEqual({
      success: true, data: { page: 1, pageSize: 25, total: 0, items: [] },
    })
    expect(mockedList).toHaveBeenCalledWith(1, 25)
    expect(exportResponse.status).toBe(200)
    expect(exportResponse.headers['content-disposition'])
      .toBe('attachment; filename="clareza-suggestions.csv"')
    expect(mockedExport).toHaveBeenCalledWith(200)
  })
})
