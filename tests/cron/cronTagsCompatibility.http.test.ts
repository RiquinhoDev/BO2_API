import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  createCronManagementController,
} from '../../src/controllers/cron/cronManagement.controller'
import {
  createCronManagementRouter,
} from '../../src/routes/cron/createCronManagementRouter'
import type { CronJobView } from '../../src/services/cron/cronTagsCompatibility.types'
installTestRuntimeConfigHooks()


const job: CronJobView = {
  _id: '507f1f77bcf86cd799439011',
  name: 'TAG_RULES_SYNC',
  description: 'Tag rules',
  syncType: 'pipeline',
  schedule: {
    cronExpression: '0 2 * * *',
    timezone: 'Europe/Lisbon',
    enabled: true,
  },
  syncConfig: {
    fullSync: true,
    includeProgress: true,
    includeTags: true,
    batchSize: 100,
  },
  tagRules: [],
  tagRuleOptions: {
    enabled: true,
    executeAllRules: true,
    runInParallel: false,
    stopOnError: false,
  },
  notifications: {
    enabled: false,
    emailOnSuccess: false,
    emailOnFailure: true,
    recipients: [],
  },
  retryPolicy: {
    maxRetries: 3,
    retryDelayMinutes: 30,
    exponentialBackoff: true,
  },
  isActive: true,
  createdBy: '507f1f77bcf86cd799439010',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
  totalRuns: 4,
  successfulRuns: 3,
  failedRuns: 1,
}

function buildService() {
  return {
    getConfig: jest.fn(async () => job),
    getHistory: jest.fn(async () => []),
    getJobHistory: jest.fn(async () => ({
      jobId: job._id,
      jobName: job.name,
      totalRuns: 4,
      successfulRuns: 3,
      failedRuns: 1,
      successRate: 75,
      executions: [],
      count: 0,
      limit: 20,
    })),
    getStatistics: jest.fn(async () => ({
      totalExecutions: 3,
      successRate: 50,
      avgDuration: 2000,
    })),
    getStatus: jest.fn(async () => ({
      stats: {
        totalJobs: 1,
        enabledJobs: 1,
        disabledJobs: 0,
        totalExecutions: 0,
        successRate: 75,
        schedulerActive: true,
      },
      upcomingJobs: [],
      recentExecutions: [],
    })),
    updateConfig: jest.fn(async () => job),
    validateCronExpression: jest.fn(() => ({
      nextExecutions: [new Date('2026-07-30T01:00:00.000Z')],
      humanReadable: 'Todos os dias às 02:00',
    })),
  }
}

function buildApp() {
  const service = buildService()
  const controller = createCronManagementController(service)
  const router = createCronManagementRouter(controller)
  const errors = createErrorHandling({
    generateCorrelationId: () => 'cron-tags-http-id',
    logError: () => undefined,
  })
  const app = express()
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/cron-tags', router)
  app.use(errors.handler)
  return { app, service }
}

const marker = { __bo2_offline_loopback: '1' }

test('updates config through a strict DTO', async () => {
  const { app, service } = buildApp()

  const response = await request(app)
    .put('/api/cron-tags/config')
    .query(marker)
    .send({ cronExpression: '0 3 * * *', isActive: false })

  expect(response.status).toBe(200)
  expect(service.updateConfig).toHaveBeenCalledWith({
    cronExpression: '0 3 * * *',
    isActive: false,
  })
  expect(response.body).toMatchObject({
    success: true,
    data: { name: 'TAG_RULES_SYNC' },
  })
})

test('rejects unknown config fields before the use case', async () => {
  const { app, service } = buildApp()

  await request(app)
    .put('/api/cron-tags/config')
    .query(marker)
    .send({
      cronExpression: '0 3 * * *',
      isActive: false,
      role: 'SUPER_ADMIN',
    })
    .expect(400)

  expect(service.updateConfig).not.toHaveBeenCalled()
})

test('passes normalized history limit to the use case', async () => {
  const { app, service } = buildApp()

  const response = await request(app)
    .get('/api/cron-tags/history')
    .query({ ...marker, limit: '20' })

  expect(response.status).toBe(200)
  expect(service.getHistory).toHaveBeenCalledWith(20)
  expect(response.body).toEqual({ success: true, data: [] })
})

test('rejects oversized history queries before persistence', async () => {
  const { app, service } = buildApp()

  await request(app)
    .get('/api/cron-tags/history')
    .query({ ...marker, limit: '10000' })
    .expect(400)

  expect(service.getHistory).not.toHaveBeenCalled()
})

test('returns real statistics and scheduler status envelopes', async () => {
  const { app } = buildApp()

  const statistics = await request(app)
    .get('/api/cron-tags/statistics')
    .query({ ...marker, days: '30' })
    .expect(200)
  const status = await request(app)
    .get('/api/cron-tags/status')
    .query(marker)
    .expect(200)

  expect(statistics.body.data).toEqual({
    totalExecutions: 3,
    successRate: 50,
    avgDuration: 2000,
  })
  expect(status.body.data.stats.schedulerActive).toBe(true)
})

test('validates cron and preserves its public response contract', async () => {
  const { app, service } = buildApp()

  const response = await request(app)
    .post('/api/cron-tags/validate')
    .query(marker)
    .send({ cronExpression: '0 2 * * *' })
    .expect(200)

  expect(service.validateCronExpression).toHaveBeenCalledWith('0 2 * * *')
  expect(response.body).toEqual({
    success: true,
    data: {
      nextExecutions: ['2026-07-30T01:00:00.000Z'],
      humanReadable: 'Todos os dias às 02:00',
    },
    meta: { valid: true },
  })
})
