import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  createCronManagementController,
  type CronTagsUseCases,
} from '../../src/controllers/cron/cronManagement.controller'
import {
  createCronManagementRouter,
} from '../../src/routes/cron/createCronManagementRouter'
installTestRuntimeConfigHooks()


const unusedAsyncUseCase = async (): Promise<never> => {
  throw new Error('execution aliases must not call a cron use case')
}
const unusedSyncUseCase = (): never => {
  throw new Error('execution aliases must not call a cron use case')
}
const useCases: CronTagsUseCases = {
  getConfig: unusedAsyncUseCase,
  getHistory: unusedAsyncUseCase,
  getJobHistory: unusedAsyncUseCase,
  getStatistics: unusedAsyncUseCase,
  getStatus: unusedAsyncUseCase,
  updateConfig: unusedAsyncUseCase,
  validateCronExpression: unusedSyncUseCase,
}
const cronTagsRouter = createCronManagementRouter(
  createCronManagementController(useCases),
)

const marker = { __bo2_offline_loopback: '1' }

const routes = [
  { name: 'api execute', path: '/api/cron-tags/execute' },
  { name: 'api execute legacy', path: '/api/cron-tags/execute-legacy' },
  { name: 'app execute', path: '/cron-tags/execute' },
  { name: 'app execute legacy', path: '/cron-tags/execute-legacy' },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'cron-tags-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/cron-tags', cronTagsRouter)
  app.use('/cron-tags', cronTagsRouter)
  app.use(errors.handler)
  return app
}

function callRoute(path: string, body: Record<string, unknown>) {
  return request(buildApp())
    .post(path)
    .query(marker)
    .send(body)
}

test.each(routes)('$name accepts its explicit DTO', async ({ path }) => {
  await callRoute(path, { userId: 'admin-1' }).expect(410)
})

test.each(routes)('$name rejects an extra role field', async ({ path }) => {
  await callRoute(path, {
    userId: 'admin-1',
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test.each(routes)('$name rejects a nested Mongo operator', async ({ path }) => {
  await callRoute(path, {
    userId: 'admin-1',
    filter: { $where: 'unsafe' },
  }).expect(400)
})
