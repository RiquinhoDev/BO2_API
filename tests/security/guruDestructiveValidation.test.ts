import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

function controllerModule(names: string[]) {
  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, res) => res.status(204).end()),
    ])),
  }
}

jest.mock('../../src/controllers/guru.webhook.controller', () => controllerModule([
  'handleGuruWebhook', 'listGuruWebhooks', 'listWebhooksGroupedByMonth',
  'getGuruStats', 'reprocessWebhook', 'debugToken', 'migrateWebhookSource',
]))
jest.mock('../../src/controllers/guru.sso.controller', () => controllerModule([
  'ssoMyOrders', 'getSubscriptionStatus', 'listSubscriptions', 'diagnosSubscription',
]))
jest.mock('../../src/controllers/guru.sync.controller', () => controllerModule([
  'syncAllFromGuru', 'syncEmailFromGuru', 'getSyncStats', 'previewSync', 'listUsersWithGuru',
]))
jest.mock('../../src/controllers/guru.analytics.controller', () => controllerModule([
  'getChurnMetrics', 'getChurnLive', 'getChurnLiveStatus', 'getMRRMetrics',
  'compareGuruVsClareza', 'fixMultiSubscriptions',
]))
jest.mock('../../src/controllers/guru.snapshot.controller', () => controllerModule([
  'createSnapshot', 'updateSnapshot', 'listSnapshots', 'getSnapshot',
  'deleteSnapshot', 'deleteAllSnapshots', 'getChurnFromSnapshots', 'createHistoricalSnapshots',
]))
jest.mock('../../src/controllers/guru.inactivation.controller', () => controllerModule([
  'listPendingInactivation', 'inactivateSingle', 'inactivateBulk', 'revertInactivationMark',
  'getInactivationStats', 'markDiscrepanciesForInactivation', 'cleanupInactivationList',
  'fixUsersToActive', 'diagnoseUsers', 'listInactivated', 'quarantineUser',
  'cleanupDuplicateUserProducts', 'restoreUserProducts', 'markStaleInactive',
]))
jest.mock('../../src/controllers/guru.trials.controller', () => controllerModule([
  'getTrials', 'getTrialsStats', 'checkExpired', 'syncTrials', 'revertTrialMark', 'inactivateTrial',
]))

import guruRouter from '../../src/routes/guru.routes'

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
    name: 'inactivate one member',
    method: 'post',
    path: '/api/guru/inactivation/single',
    body: { userProductId: objectId },
  },
  {
    name: 'inactivate members in bulk',
    method: 'post',
    path: '/api/guru/inactivation/bulk',
    body: { userProductIds: [objectId] },
  },
  {
    name: 'delete one monthly snapshot',
    method: 'delete',
    path: '/api/guru/snapshots/2026/7',
    body: {},
  },
  {
    name: 'delete every snapshot',
    method: 'delete',
    path: '/api/guru/snapshots/all',
    body: {},
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'guru-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/guru', guruRouter)
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
