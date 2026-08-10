import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { createErrorHandling, internalError } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()


let forwardCriticalDeleteFailure = false
const mockControllerHandler = jest.fn(
  (_input: unknown, res: Response, next: NextFunction) => {
    if (forwardCriticalDeleteFailure) {
      next(internalError(
        'Erro ao deletar tag crítica',
        'CRITICAL_TAG_DELETE_FAILED',
        new Error('secret alice@example.test token=hidden'),
      ))
      return
    }
    res.status(204).end()
  },
)

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

jest.mock('../../src/controllers/tagMonitoring', () => ({
  criticalTagController: {
    getCriticalTags: mockControllerHandler,
    addCriticalTag: mockControllerHandler,
    removeCriticalTag: mockControllerHandler,
    deleteCriticalTag: mockControllerHandler,
    toggleCriticalTag: mockControllerHandler,
    updateCriticalTagPriority: mockControllerHandler,
    getAvailableNativeTags: mockControllerHandler,
    getCriticalTagsStats: mockControllerHandler,
  },
  tagNotificationController: {
    getNotifications: mockControllerHandler,
    getNotificationById: mockControllerHandler,
    getNotificationDetails: mockControllerHandler,
    markAsRead: mockControllerHandler,
    markAsUnread: mockControllerHandler,
    dismissNotification: mockControllerHandler,
    getUnreadCount: mockControllerHandler,
    markAllAsRead: mockControllerHandler,
    getNotificationStats: mockControllerHandler,
  },
  tagMonitoringController: {
    getStudentsByPriority: mockControllerHandler,
    getSnapshots: mockControllerHandler,
    getSnapshotsByEmail: mockControllerHandler,
    compareSnapshots: mockControllerHandler,
    executeManualSnapshot: mockControllerHandler,
    getStats: mockControllerHandler,
    getWeeklyStats: mockControllerHandler,
    getScopeConfig: mockControllerHandler,
    updateScopeConfig: mockControllerHandler,
    toggleMonitoring: mockControllerHandler,
  },
}))

import tagMonitoringRouter from '../../src/routes/tagMonitoring.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'

type DestructiveRoute = {
  name: string
  path: string
}

const routes: DestructiveRoute[] = [
  {
    name: 'permanently delete a critical tag',
    path: `/api/tag-monitoring/critical-tags/${objectId}/permanent`,
  },
  {
    name: 'dismiss a tag notification',
    path: `/api/tag-monitoring/notifications/${objectId}`,
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'tag-monitoring-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/tag-monitoring', tagMonitoringRouter)
  app.use(errors.handler)
  return app
}

function callRoute(
  route: DestructiveRoute,
  body: Record<string, unknown> = {},
) {
  const pending = request(buildApp()).delete(route.path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test.each(routes)('$name accepts its explicit DTO and real path params', async (route) => {
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

test.each([
  '/api/tag-monitoring/critical-tags/not-an-object-id/permanent',
  '/api/tag-monitoring/notifications/not-an-object-id',
])('rejects an invalid ObjectId at the boundary: %s', async (path) => {
  await request(buildApp())
    .delete(path)
    .query(marker)
    .expect(400)
})
test('permanent critical-tag delete forwards controller errors after strict validation', async () => {
  forwardCriticalDeleteFailure = true
  try {
    const response = await request(buildApp())
      .delete('/api/tag-monitoring/critical-tags/507f1f77bcf86cd799439011/permanent')
      .query(marker)

    expect(response.status).toBe(500)
    expect(response.headers['x-request-id']).toBe('tag-monitoring-validation-id')
    expect(response.body).toEqual({
      success: false,
      code: 'CRITICAL_TAG_DELETE_FAILED',
      message: 'Erro ao deletar tag crítica',
      correlationId: 'tag-monitoring-validation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('secret')
    expect(JSON.stringify(response.body)).not.toContain('alice@example.test')
  } finally {
    forwardCriticalDeleteFailure = false
  }
})
