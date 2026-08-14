import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { bulkOperationGuard } from '../../src/security/bulkOperationPolicy'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()

jest.mock('../../src/controllers/syncUtilizadoresControllers/syncStats.controller', () => ({
  __esModule: true,
  getSyncById: jest.fn(),
  getConflicts: jest.fn(),
  getCriticalConflicts: jest.fn(),
  getConflictById: jest.fn(),
  resolveConflict: jest.fn(),
  ignoreConflict: jest.fn(),
  bulkResolveConflicts: jest.fn((_req, res) => res.status(204).end()),
  autoResolveConflicts: jest.fn((_req, res) => res.status(204).end()),
  getSnapshotStats: jest.fn(),
}))

import syncStatsRouter from '../../src/routes/syncUtilizadoresRoutes/syncStats.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'sync-conflict-validation-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use(bulkOperationGuard)
  app.use('/api/sync', syncStatsRouter)
  app.use(errors.handler)
  return app
}

test.each([
  {
    name: 'bulk resolve',
    path: '/api/sync/conflicts/bulk-resolve',
    body: {
      conflictIds: [objectId],
      action: 'MERGED',
    },
  },
  {
    name: 'auto resolve',
    path: '/api/sync/conflicts/auto-resolve',
    body: {
      conflictIds: [objectId],
    },
  },
])('$name rejects more than 200 conflict ids', async ({ path, body }) => {
  const conflictIds = Array.from({ length: 201 }, () => objectId)
  await request(buildApp())
    .post(path)
    .query(marker)
    .send({ ...body, conflictIds })
    .expect(400)
})
