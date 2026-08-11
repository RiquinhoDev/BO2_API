import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()


jest.mock('../../src/controllers/acTags/activeCampaignCourse.controller', () => ({
  __esModule: true,
  getClarezaStudents: jest.fn((_req, res) => res.status(204).end()),
  evaluateClarezaRules: jest.fn((_req, res) => res.status(204).end()),
  getOGIStudents: jest.fn((_req, res) => res.status(204).end()),
  evaluateOGIRules: jest.fn((_req, res) => res.status(204).end()),
}))

jest.mock('../../src/controllers/acTags/activeCampaignHistoryList.controller', () => ({
  __esModule: true,
  getCommunicationHistory: jest.fn((_req, res) => res.status(204).end()),
}))

jest.mock('../../src/controllers/acTags/activeCampaignHistoryStats.controller', () => ({
  __esModule: true,
  getHistoryStats: jest.fn((_req, res) => res.status(204).end()),
}))

jest.mock('../../src/controllers/acTags/activeCampaignOps.controller', () => ({
  __esModule: true,
  testCron: jest.fn((_input, _req, res) => res.status(204).end()),
  getCronLogs: jest.fn((_req, res) => res.status(204).end()),
  getStats: jest.fn((_req, res) => res.status(204).end()),
}))

jest.mock('../../src/controllers/acTags/activeCampaignLegacyTagRules.controller', () => ({
  __esModule: true,
  getAllTagRules: jest.fn((_req, res) => res.status(204).end()),
  createTagRule: jest.fn((_req, res) => res.status(204).end()),
  updateTagRule: jest.fn((_req, res) => res.status(204).end()),
  deleteTagRule: jest.fn((_input, _req, res) => res.status(204).end()),
}))


jest.mock('../../src/controllers/acTags/tagRule.controller', () => ({
  __esModule: true,
  getAllRules: jest.fn((_req, res) => res.status(204).end()),
  getRuleById: jest.fn((_req, res) => res.status(204).end()),
  createRule: jest.fn((_req, res) => res.status(204).end()),
  updateRule: jest.fn((_req, res) => res.status(204).end()),
  deleteRule: jest.fn((_req, res) => res.status(204).end()),
  testRule: jest.fn((_req, res) => res.status(204).end()),
}))
jest.mock('../../src/controllers/acTags/activeCampaignProductTags.controller', () => ({
  __esModule: true,
  applyTagToUserProduct: jest.fn((_input, _req, res) => res.status(204).end()),
  removeTagFromUserProduct: jest.fn((_input, _req, res) => res.status(204).end()),
  getUsersWithTagsInProduct: jest.fn((_req, res) => res.status(204).end()),
  getACStats: jest.fn((_req, res) => res.status(204).end()),
  syncProductTags: jest.fn((_input, _req, res) => res.status(204).end()),
}))

jest.mock('../../src/routes', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express')
  return { __esModule: true, default: Router() }
})

import { deleteRule } from '../../src/controllers/acTags/tagRule.controller'
import tagRuleRouter from '../../src/routes/ACroutes/tagRule.routes'
import activeCampaignRouter from '../../src/routes/ACroutes/activecampaign.routes'
import { registerRoutes } from '../../src/runtime/registerRoutes'

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
    path: `/api/tag-rules/${objectId}`,
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
    path: `/api/activecampaign/products/${productId}/tags/sync`,
    body: {},
  },
  {
    name: 'apply product tag',
    method: 'post',
    path: '/api/activecampaign/product-tags/apply',
    body: { userId: objectId, productId, tagName: 'OGI_V1 - Inativo 7d' },
  },
  {
    name: 'remove product tag',
    method: 'post',
    path: '/api/activecampaign/product-tags/remove',
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
  app.use('/api/tag-rules', tagRuleRouter)
  app.use(errors.handler)
  return app
}

function buildRuntimeApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'activecampaign-runtime-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  registerRoutes(app)
  app.use('/api/tag-rules', tagRuleRouter)
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

test('canonical delete rejects an invalid ObjectId before its controller', async () => {
  const deleteController = jest.mocked(deleteRule)
  deleteController.mockClear()

  await request(buildRuntimeApp())
    .delete('/api/tag-rules/not-an-object-id')
    .query(marker)
    .expect(400)

  expect(deleteController).not.toHaveBeenCalled()
})
