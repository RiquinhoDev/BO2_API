import type { RequestHandler } from 'express'
import request from 'supertest'

import { createApp } from '../../src/app'
import clarezaRouter from '../../src/routes/clareza.routes'
import clarezaJob from '../../src/jobs/clarezaCanonical.job'
import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'
import { runClarezaRefreshWithReceipt } from '../../src/services/clareza/clarezaRefreshExecution.service'
import { HttpError } from '../../src/security/errorHandling'
import { runCoreAliasMaintenance } from '../../src/services/clareza/core/coreAlias.runtime'
import { backfillPublishedCoreCompanions } from '../../src/services/clareza/core/coreCompanionBackfill.runtime'

jest.mock('../../src/jobs/clarezaCanonical.job', () => ({
  __esModule: true,
  default: { run: jest.fn().mockResolvedValue({ success: true, total: 879, errors: 0 }) },
}))
jest.mock('../../src/services/clareza/clarezaRefreshExecution.service', () => ({
  runClarezaRefreshWithReceipt: jest.fn(),
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

beforeEach(() => {
  jest.clearAllMocks()
  resetRuntimeConfigForTests()
  const base = createTestRuntimeConfig({ clarezaCanonicalEnabled: true, clarezaRefreshEnabled: true, clarezaFmpEgressEnabled: true })
  initializeRuntimeConfig({ ...base, integrations: { ...base.integrations, fmp: { configured: true, value: { apiKey: 'test-only-key' } } } })
  jest.mocked(runClarezaRefreshWithReceipt).mockImplementation(async options => options.refresh({
    assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn(),
  }))
})
afterEach(() => resetRuntimeConfigForTests())

describe('Clareza operations production mount', () => {
  it.each(['failures', 'conflicts'] as const)('does not complete aliases with %s', async field => {
    jest.mocked(runCoreAliasMaintenance).mockResolvedValueOnce({ status: 'published', revision: 1, processed: 1, aliasesAdded: 0, failures: 0, conflicts: 0, remaining: 1, [field]: 1 })
    const response = await request(app()).post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN').send({ operation: 'aliases', limit: 1 })
    expect(response.status).toBe(500)
    expect(response.body.success).not.toBe(true)
  })

  it('disabled mode refuses before claiming receipt or invoking providers', async () => {
    resetRuntimeConfigForTests()
    initializeRuntimeConfig(createTestRuntimeConfig())
    const response = await request(app()).post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN').send({ operation: 'aliases', limit: 1 })
    expect(response.status).toBe(503)
    expect(runClarezaRefreshWithReceipt).not.toHaveBeenCalled()
    expect(runCoreAliasMaintenance).not.toHaveBeenCalled()
  })

  it('indeterminate receipt returns 503 without repeating operation', async () => {
    jest.mocked(runClarezaRefreshWithReceipt).mockRejectedValueOnce(new HttpError({ status: 503, code: 'CLAREZA_REFRESH_INDETERMINATE', publicMessage: 'Requer reconciliação' }))
    const response = await request(app()).post('/api/clareza/operations?__bo2_offline_loopback=1')
      .set('x-test-role', 'SUPER_ADMIN').send({ operation: 'refresh' })
    expect(response.status).toBe(503)
    expect(clarezaJob.run).not.toHaveBeenCalled()
  })
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
