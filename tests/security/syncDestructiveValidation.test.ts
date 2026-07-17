import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/controllers/sync.controller', () => {
  const names = [
    'executePipeline',
    'syncHotmartEndpoint',
    'syncHotmartBatchEndpoint',
    'syncCurseducaEndpoint',
    'syncCurseducaBatchEndpoint',
    'syncDiscordEndpoint',
    'syncDiscordCSVEndpoint',
    'syncDiscordBatchEndpoint',
    'getSyncHistory',
    'createSyncRecord',
    'retrySyncOperation',
    'cleanOldHistory',
    'getSyncStats',
    'getSyncStatus',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, res) => res.status(204).end()),
    ])),
  }
})

import * as syncController from '../../src/controllers/sync.controller'
import syncRouter from '../../src/routes/sync.routes'

const marker = { __bo2_offline_loopback: '1' }

type DestructiveRoute = {
  name: string
  method: 'post' | 'delete'
  path: string
}

const routes: DestructiveRoute[] = [
  {
    name: 'execute the sync pipeline',
    method: 'post',
    path: '/api/sync/execute-pipeline',
  },
  {
    name: 'clean old sync history',
    method: 'delete',
    path: '/api/sync/history/clean?days=30',
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'sync-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/sync', syncRouter)
  app.use(errors.handler)
  return app
}

function callRoute(
  route: DestructiveRoute,
  body: Record<string, unknown> = {},
) {
  const separator = route.path.includes('?') ? '&' : '?'
  const path = `${route.path}${separator}__bo2_offline_loopback=${marker.__bo2_offline_loopback}`
  const pending = request(buildApp())[route.method](path)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test.each(routes)('$name accepts its explicit DTO', async (route) => {
  await callRoute(route).expect(204)
})

test.each(routes)('$name rejects an extra role field', async (route) => {
  await callRoute(route, { role: 'SUPER_ADMIN' }).expect(400)
})

test.each(routes)('$name rejects a nested Mongo operator', async (route) => {
  await callRoute(route, {
    filter: { $where: 'unsafe' },
  }).expect(400)
})

test('clean history forwards a numeric days query to the handler', async () => {
  const clean = jest.mocked(syncController.cleanOldHistory)
  clean.mockClear()

  await callRoute(routes[1]).expect(204)

  expect(clean).toHaveBeenCalledWith(
    expect.objectContaining({
      body: {},
      params: {},
      query: { days: '30' },
    }),
    expect.anything(),
  )
})

test.each([
  '/api/sync/history/clean?days=abc',
  '/api/sync/history/clean?foo=1',
])('clean history rejects an invalid query: %s', async (path) => {
  await request(buildApp())
    .delete(path)
    .query(marker)
    .expect(400)
})
