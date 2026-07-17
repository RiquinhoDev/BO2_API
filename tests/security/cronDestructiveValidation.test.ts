import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/controllers/syncUtilizadoresControllers/cronManagement.controller', () => {
  const names = [
    'getAllJobs',
    'getJobById',
    'createJob',
    'updateJob',
    'deleteJob',
    'toggleJob',
    'triggerJob',
    'getJobHistory',
    'validateCronExpression',
    'getSchedulerStatus',
    'getAvailableTagRules',
    'triggerTagRulesOnly',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, res) => res.status(204).end()),
    ])),
  }
})

import cronRouter from '../../src/routes/syncUtilizadoresRoutes/cron.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'

type DestructiveRoute = {
  name: string
  method: 'post' | 'delete'
  path: string
  body: Record<string, unknown>
}

const routes: DestructiveRoute[] = [
  {
    name: 'delete a cron job',
    method: 'delete',
    path: `/api/cron/jobs/${objectId}`,
    body: {},
  },
  {
    name: 'trigger a cron job',
    method: 'post',
    path: `/api/cron/jobs/${objectId}/trigger`,
    body: {},
  },
  {
    name: 'run only tag rules',
    method: 'post',
    path: '/api/cron/tag-rules-only',
    body: {},
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'cron-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/cron', cronRouter)
  app.use(errors.handler)
  return app
}

function callRoute(route: DestructiveRoute, body: Record<string, unknown>) {
  const pending = request(buildApp())[route.method](route.path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test.each(routes)('$name accepts its explicit DTO and real path params', async (route) => {
  await callRoute(route, route.body).expect(204)
})

test.each(routes)('$name rejects an extra role field', async (route) => {
  await callRoute(route, {
    ...route.body,
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test.each(routes)('$name rejects a nested Mongo operator', async (route) => {
  await callRoute(route, {
    ...route.body,
    filter: { $where: 'unsafe' },
  }).expect(400)
})

test.each([
  ['delete', '/api/cron/jobs/not-an-object-id'],
  ['post', '/api/cron/jobs/not-an-object-id/trigger'],
] as const)('%s job route rejects an invalid ObjectId at the boundary', async (method, path) => {
  await request(buildApp())[method](path).query(marker).expect(400)
})
