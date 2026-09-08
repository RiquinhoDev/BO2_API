import express from 'express'
import request from 'supertest'

jest.mock('../../src/controllers/clarezaController', () => ({
  clarezaController: new Proxy({}, { get: () => (_req: unknown, res: express.Response) => res.json({ handler: 'legacy' }) }),
}))
jest.mock('../../src/controllers/clarezaCore.controller', () => ({
  clarezaCoreController: new Proxy({}, { get: () => (_req: unknown, res: express.Response) => res.json({ handler: 'core' }) }),
}))
jest.mock('../../src/controllers/clarezaSuggestion.controller', () => ({
  submitClarezaSuggestion: (_req: unknown, res: express.Response) => res.json({ handler: 'suggestions' }),
}))
jest.mock('../../src/controllers/clarezaSuggestionAdmin.controller', () => ({
  clarezaSuggestionAdminController: new Proxy({}, { get: () => (_req: unknown, res: express.Response) => res.json({ handler: 'admin' }) }),
}))
jest.mock('../../src/controllers/clarezaOperations.controller', () => ({
  clarezaOperationsController: (_req: unknown, res: express.Response) => res.json({ handler: 'operations' }),
}))
jest.mock('../../src/middleware/auth.middleware', () => ({
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))
jest.mock('../../src/services/clareza/canonicalSettings', () => ({
  isClarezaCanonicalEnabled: jest.fn(() => true),
}))

import router from '../../src/routes/clareza.routes'
import { isClarezaCanonicalEnabled } from '../../src/services/clareza/canonicalSettings'

beforeEach(() => jest.mocked(isClarezaCanonicalEnabled).mockReturnValue(true))

test.each(['/data', '/top10', '/raiox', '/carteira/data', '/earnings/data', '/comparador'])(
  'keeps legacy read %s while canonical migration is disabled', async path => {
    jest.mocked(isClarezaCanonicalEnabled).mockReturnValue(false)
    const result = await request(express().use('/api/clareza', router)).get(`/api/clareza${path}`).query({ __bo2_offline_loopback: '1' })
    expect(result.status).toBe(200)
    expect(result.body.handler).toBe('legacy')
  },
)

test.each(['/radar', '/carteira/search', '/carteira/analysis', '/data', '/top10', '/raiox', '/carteira/data', '/earnings/data', '/comparador'])(
  'published route %s uses the canonical core', async path => {
    const app = express().use('/api/clareza', router)
    const result = await request(app).get(`/api/clareza${path}`).query({ __bo2_offline_loopback: '1' })
    expect(result.status).toBe(200)
    expect(result.body.handler).toBe('core')
  },
)

test.each([
  ['post', '/suggestions', 'suggestions'],
  ['get', '/suggestions/admin', 'admin'],
  ['get', '/suggestions/admin/export', 'admin'],
  ['post', '/operations', 'operations'],
] as const)('mounts %s %s', async (method, path, handler) => {
  const app = express().use('/api/clareza', router)
  const result = await request(app)[method](`/api/clareza${path}`).query({ __bo2_offline_loopback: '1' })
  expect(result.status).toBe(200)
  expect(result.body.handler).toBe(handler)
})
