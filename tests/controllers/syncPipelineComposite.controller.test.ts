import express from 'express'
import request from 'supertest'

import syncRouter from '../../src/routes/sync.routes'
import { createErrorHandling } from '../../src/security/errorHandling'
import { resetRuntimeConfigForTests, useTestRuntimeConfig } from '../support/runtimeConfig'

jest.mock('../../src/services/cron/dailyPipeline.service', () => ({
  executeDailyPipeline: jest.fn(),
}))
jest.mock('../../src/services/cron/compositeExecution.service', () => ({
  compositeExecutionFingerprint: jest.fn(() => 'fingerprint'),
  runCompositeExecutionWithReceipt: jest.fn(),
}))

const { executeDailyPipeline } = jest.requireMock('../../src/services/cron/dailyPipeline.service') as {
  executeDailyPipeline: jest.Mock
}
const { runCompositeExecutionWithReceipt } = jest.requireMock('../../src/services/cron/compositeExecution.service') as {
  runCompositeExecutionWithReceipt: jest.Mock
}

function app() {
  const server = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'generated-pipeline-id',
    logError: jest.fn(),
  })
  server.use(errors.correlationId)
  server.use(express.json())
  server.use('/api/sync', syncRouter)
  server.use(errors.handler)
  return server
}

beforeEach(() => {
  jest.clearAllMocks()
  useTestRuntimeConfig({ syncMutableExecutionEnabled: true })
  executeDailyPipeline.mockResolvedValue({
    success: true,
    duration: 4,
    summary: { totalUsers: 2, totalUserProducts: 3, engagementUpdated: 1, tagsApplied: 1 },
    steps: { syncHotmart: { success: true, duration: 1, stats: { total: 2 } } },
    errors: [],
  })
  runCompositeExecutionWithReceipt.mockImplementation(async (options: {
    run: (hooks: { providerStarted(): void; providerSucceeded(): void; localMutationStarted(): void }) => Promise<unknown>
  }) => options.run({
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }))
})

afterEach(() => {
  resetRuntimeConfigForTests()
})

test('passes request ID, actor and stable fingerprint into the shared receipt runner', async () => {
  const response = await request(app())
    .post('/api/sync/execute-pipeline')
    .set('X-Request-ID', 'pipeline-request-a')
    .query({ __bo2_offline_loopback: '1' })
    .send({})

  expect(response.status).toBe(200)
  expect(response.headers['x-request-id']).toBe('pipeline-request-a')
  expect(runCompositeExecutionWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
    operation: 'sync-pipeline',
    identity: 'daily-pipeline',
    actorId: 'system',
    requestId: 'pipeline-request-a',
    fingerprint: 'fingerprint',
  }))
  expect(executeDailyPipeline).toHaveBeenCalledWith({ phaseHooks: expect.any(Object) })
})

test('dryRun returns the plan and bypasses receipt and mutable execution', async () => {
  executeDailyPipeline.mockResolvedValueOnce({
    dryRun: true,
    success: true,
    duration: 0,
    summary: { totalUsers: 0, totalUserProducts: 12, engagementUpdated: 0, tagsApplied: 0 },
    steps: {},
    plan: {
      operation: 'daily-pipeline',
      dryRun: true,
      limit: 20_000,
      withinLimit: true,
      activeUserProducts: 12,
      testimonialUsers: 3,
      configuredProducts: { hotmart: 1, curseduca: 1 },
      steps: ['syncHotmart'],
    },
    errors: [],
  })

  const response = await request(app())
    .post('/api/sync/execute-pipeline')
    .query({ __bo2_offline_loopback: '1' })
    .send({ dryRun: true })

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({ dryRun: true, plan: { activeUserProducts: 12 } })
  expect(executeDailyPipeline).toHaveBeenCalledWith({ dryRun: true })
  expect(runCompositeExecutionWithReceipt).not.toHaveBeenCalled()
})

test('mutable execution fails closed before receipt claim when the switch is off', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ syncMutableExecutionEnabled: false })

  const response = await request(app())
    .post('/api/sync/execute-pipeline')
    .set('X-Request-ID', 'pipeline-disabled')
    .query({ __bo2_offline_loopback: '1' })
    .send({})

  expect(response.status).toBe(503)
  expect(response.body).toMatchObject({
    success: false,
    code: 'SYNC_PIPELINE_EXECUTION_DISABLED',
  })
  expect(runCompositeExecutionWithReceipt).not.toHaveBeenCalled()
  expect(executeDailyPipeline).not.toHaveBeenCalled()
})
