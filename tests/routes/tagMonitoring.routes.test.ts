import express, { type Request, type Response } from 'express'
import request from 'supertest'

jest.mock('../../src/middleware/auth.middleware', () => ({
  __esModule: true,
  authenticate: (_req: Request, _res: Response, next: () => void) => next(),
}))

const responseHandler = (source: string) =>
  jest.fn((_req: Request, res: Response) => res.status(200).json({ source }))

jest.mock('../../src/controllers/tagMonitoring', () => ({
  __esModule: true,
  criticalTagController: {
    getCriticalTags: jest.fn(),
    addCriticalTag: jest.fn(),
    removeCriticalTag: jest.fn(),
    deleteCriticalTag: jest.fn(),
    toggleCriticalTag: jest.fn(),
    updateCriticalTagPriority: jest.fn(),
    getAvailableNativeTags: jest.fn(),
    getCriticalTagsStats: jest.fn(),
  },
  tagNotificationController: {
    getNotifications: jest.fn(),
    getNotificationById: responseHandler('notification-by-id'),
    getNotificationDetails: jest.fn(),
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    dismissNotification: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllAsRead: jest.fn(),
    getNotificationStats: responseHandler('notification-stats'),
  },
  tagMonitoringController: {
    getStudentsByPriority: jest.fn(),
    getSnapshots: jest.fn(),
    getSnapshotsByEmail: jest.fn(),
    compareSnapshots: jest.fn(),
    executeManualSnapshot: jest.fn(),
    getStats: jest.fn(),
    getWeeklyStats: jest.fn(),
    getScopeConfig: jest.fn(),
    updateScopeConfig: jest.fn(),
    toggleMonitoring: jest.fn(),
  },
}))

import tagMonitoringRouter from '../../src/routes/tagMonitoring.routes'
import { tagNotificationController } from '../../src/controllers/tagMonitoring'

function buildApp() {
  const app = express()
  app.use('/api/tag-monitoring', tagMonitoringRouter)
  return app
}

test('dispatches notification stats to the static handler', async () => {
  const response = await request(buildApp())
    .get('/api/tag-monitoring/notifications/stats')
    .query({ __bo2_offline_loopback: '1' })
    .expect(200)

  expect(response.body).toEqual({ source: 'notification-stats' })
  expect(tagNotificationController.getNotificationStats).toHaveBeenCalledTimes(1)
  expect(tagNotificationController.getNotificationById).not.toHaveBeenCalled()
})
