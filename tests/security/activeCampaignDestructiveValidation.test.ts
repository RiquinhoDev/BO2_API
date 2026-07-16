import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/controllers/acTags/activecampaign.controller', () => {
  const names = [
    'testCron',
    'getCronLogs',
    'getStats',
    'getClarezaStudents',
    'evaluateClarezaRules',
    'getOGIStudents',
    'evaluateOGIRules',
    'getAllTagRules',
    'createTagRule',
    'updateTagRule',
    'deleteTagRule',
    'getHistoryStats',
    'getCommunicationHistory',
    'applyTagToUserProduct',
    'removeTagFromUserProduct',
    'getUsersWithTagsInProduct',
    'getACStats',
    'syncProductTags',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, res) => res.status(204).end()),
    ])),
  }
})

import activeCampaignRouter from '../../src/routes/ACroutes/activecampaign.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'
const productId = '507f191e810c19729de860ea'

type DestructiveRoute = {
  name: string
  method: 'post' | 'delete'
  path: string
  body: Record<string, unknown>
}

const routes: DestructiveRoute[] = [
  {
    name: 'delete tag rule',
    method: 'delete',
    path: `/api/activecampaign/tag-rules/${objectId}`,
    body: {},
  },
  {
    name: 'test cron',
    method: 'post',
    path: '/api/activecampaign/test-cron',
    body: {},
  },
  {
    name: 'sync product tags',
    method: 'post',
    path: `/api/activecampaign/v2/sync/${productId}`,
    body: {},
  },
  {
    name: 'apply product tag',
    method: 'post',
    path: '/api/activecampaign/v2/tag/apply',
    body: { userId: objectId, productId, tagName: 'OGI_V1 - Inativo 7d' },
  },
  {
    name: 'remove product tag',
    method: 'post',
    path: '/api/activecampaign/v2/tag/remove',
    body: { userId: objectId, productId, tagName: 'OGI_V1 - Inativo 7d' },
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'activecampaign-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/activecampaign', activeCampaignRouter)
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
