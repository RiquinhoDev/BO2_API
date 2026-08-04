import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()


const executeTagRulesOnly = jest.fn()
const executeDailyPipeline = jest.fn()

jest.mock('../../src/services/cron/dailyPipeline.service', () => ({
  __esModule: true,
  executeTagRulesOnly,
  executeDailyPipeline,
}))

import cronTagsRouter from '../../src/routes/cron/cronManagement.routes'

const marker = { __bo2_offline_loopback: '1' }

const executionRoutes = [
  '/api/cron-tags/execute',
  '/api/cron-tags/execute-legacy',
  '/cron-tags/execute',
  '/cron-tags/execute-legacy',
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'cron-tags-compatibility-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/cron-tags', cronTagsRouter)
  app.use('/cron-tags', cronTagsRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  executeTagRulesOnly.mockClear()
  executeDailyPipeline.mockClear()
})

test.each(executionRoutes)(
  'returns 410 without writing through deprecated alias %s',
  async path => {
    const response = await request(buildApp())
      .post(path)
      .query(marker)
      .send({ userId: 'admin-1' })

    expect(response.status).toBe(410)
    expect(response.body).toEqual({
      success: false,
      error: expect.any(String),
      replacement: '/api/cron/tag-rules-only',
    })
    expect(executeTagRulesOnly).not.toHaveBeenCalled()
    expect(executeDailyPipeline).not.toHaveBeenCalled()
  },
)
