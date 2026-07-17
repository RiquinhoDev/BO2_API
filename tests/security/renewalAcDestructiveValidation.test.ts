import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/services/renewal/renewalAcSync.service', () => ({
  approveChanges: jest.fn(async () => 0),
  executePlan: jest.fn(async () => ({
    attempted: 0,
    applied: 0,
    alreadyInSync: 0,
    failed: 0,
    blockedBySwitch: 0,
    leftForNextRun: 0,
    masterEnabled: true,
  })),
  generatePlan: jest.fn(async () => ({ anomalyAborted: false })),
  getRenewalAcStatus: jest.fn(async () => ({})),
  revertChange: jest.fn(async () => ({
    success: true,
    message: 'reverted offline',
  })),
}))

jest.mock('../../src/services/renewal/hotmartRefunds.service', () => ({
  detectHotmartRefunds: jest.fn(async () => ({})),
}))

jest.mock('../../src/models/RenewalAcChange', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: {},
}))

import renewalAcRouter from '../../src/routes/renewalAc.routes'

const renewalAcService = jest.requireMock(
  '../../src/services/renewal/renewalAcSync.service',
) as {
  executePlan: jest.Mock
  revertChange: jest.Mock
}

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'

type DestructiveRoute = {
  name: string
  path: string
  body: Record<string, unknown>
}

const routes: DestructiveRoute[] = [
  {
    name: 'execute the renewal AC plan',
    path: '/api/renewal-ac/execute',
    body: {
      batchId: 'batch-2026-07',
      includePlanned: true,
      actor: 'reviewer@example.test',
    },
  },
  {
    name: 'revert a renewal AC change',
    path: `/api/renewal-ac/changes/${objectId}/revert`,
    body: {
      actor: 'reviewer@example.test',
    },
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'renewal-ac-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/renewal-ac', renewalAcRouter)
  app.use(errors.handler)
  return app
}

function callRoute(route: DestructiveRoute, body: Record<string, unknown>) {
  return request(buildApp())
    .post(route.path)
    .query(marker)
    .send(body)
}

test.each(routes)('$name accepts its explicit DTO and real path params', async (route) => {
  await callRoute(route, route.body).expect(200)
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

test('execute preserves actor from the validated body', async () => {
  const execute = renewalAcService.executePlan
  execute.mockClear()

  await callRoute(routes[0], { actor: 'reviewer@example.test' }).expect(200)

  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    executedBy: 'reviewer@example.test',
  }))
})

test('revert preserves actor from the validated body', async () => {
  const revert = renewalAcService.revertChange
  revert.mockClear()

  await callRoute(routes[1], { actor: 'reviewer@example.test' }).expect(200)

  expect(revert).toHaveBeenCalledWith(
    objectId,
    'reviewer@example.test',
  )
})

test('revert rejects an invalid ObjectId at the boundary', async () => {
  await request(buildApp())
    .post('/api/renewal-ac/changes/not-an-object-id/revert')
    .query(marker)
    .send({ actor: 'reviewer@example.test' })
    .expect(400)
})
