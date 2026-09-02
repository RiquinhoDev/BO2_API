import type { RequestHandler } from 'express'
import request from 'supertest'

import { createApp } from '../../src/app'
import clarezaRouter from '../../src/routes/clareza.routes'
import clarezaJob from '../../src/jobs/clareza.job'
import { runCoreAliasMaintenance } from '../../src/services/clareza/core/coreAlias.runtime'
import { backfillPublishedCoreCompanions } from '../../src/services/clareza/core/coreCompanionBackfill.runtime'

jest.mock('../../src/jobs/clareza.job', () => ({
  __esModule: true,
  default: { run: jest.fn().mockResolvedValue({ success: true, total: 879, errors: 0 }) },
}))
jest.mock('../../src/services/clareza/core/coreAlias.runtime', () => ({
  runCoreAliasMaintenance: jest.fn().mockResolvedValue({
    status: 'published', revision: 1, processed: 1, aliasesAdded: 2,
    failures: 0, conflicts: 0, remaining: 0,
  }),
}))
jest.mock('../../src/services/clareza/core/coreCompanionBackfill.runtime', () => ({
  backfillPublishedCoreCompanions: jest.fn().mockResolvedValue({
    generationId: 'core-1', errors: 0,
    raiox: { total: 185, errors: 0 },
    earnings: { total: 347, errors: 0 },
    top10: { total: 10, errors: 0 },
  }),
}))

const authenticateRequest: RequestHandler = (req, _res, next) => {
  req.user = {
    id: 'admin-id', email: 'admin@example.test',
    role: String(req.header('x-test-role') ?? 'MODERATOR'), permissions: [],
  }
  next()
}

const app = () => createApp({
  authEnforce: true,
  authenticateRequest,
  registerRoutes: instance => instance.use('/api/clareza', clarezaRouter),
})

beforeEach(() => jest.clearAllMocks())

describe('Clareza operations production mount', () => {
  it('denies ADMIN before starting any provider operation', async () => {
    const response = await request(app())
      .post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'ADMIN')
      .send({ operation: 'aliases', limit: 1 })

    expect(response.status).toBe(403)
    expect(runCoreAliasMaintenance).not.toHaveBeenCalled()
    expect(clarezaJob.run).not.toHaveBeenCalled()
    expect(backfillPublishedCoreCompanions).not.toHaveBeenCalled()
  })

  it('allows SUPER_ADMIN through the single bounded alias operation', async () => {
    const response = await request(app())
      .post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ operation: 'aliases', limit: 1, tickers: ['CSP1.L'] })

    expect(response.status).toBe(200)
    expect(runCoreAliasMaintenance).toHaveBeenCalledWith({ limit: 1, tickers: ['CSP1.L'] })
    expect(response.body).toMatchObject({
      success: true, data: { operation: 'aliases', status: 'published' },
    })
  })

  it('allows SUPER_ADMIN to backfill only the published generation companions', async () => {
    const response = await request(app())
      .post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ operation: 'companions' })

    expect(response.status).toBe(200)
    expect(backfillPublishedCoreCompanions).toHaveBeenCalledTimes(1)
    expect(clarezaJob.run).not.toHaveBeenCalled()
    expect(response.body).toMatchObject({
      success: true, data: { operation: 'companions', generationId: 'core-1', errors: 0 },
    })
  })
})
