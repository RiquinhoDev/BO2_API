import fs from 'node:fs'
import path from 'node:path'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  criticalTagManagementService,
  tagNotificationService,
  weeklyTagMonitoringService,
} from '../../src/services/tagMonitoring'
import * as criticalTagController from '../../src/controllers/tagMonitoring/criticalTag.controller'
import * as tagNotificationController from '../../src/controllers/tagMonitoring/tagNotification.controller'
import * as tagMonitoringController from '../../src/controllers/tagMonitoring/tagMonitoring.controller'

installTestRuntimeConfigHooks()

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

jest.mock('../../src/services/tagMonitoring', () => ({
  criticalTagManagementService: {
    getCriticalTags: jest.fn(),
  },
  tagNotificationService: {
    getNotifications: jest.fn(),
  },
  weeklyTagMonitoringService: {
    getSnapshotStats: jest.fn(),
  },
}))

import tagMonitoringRouter from '../../src/routes/tagMonitoring.routes'

const correlationId = 'tag-monitoring-request'
const privateHandlerNames = new Set<string>()
const tagMonitoringRouteSourcePath = path.resolve(
  __dirname,
  '../../src/routes/tagMonitoring.routes.ts',
)
const controllerHandlerReference = /\b(criticalTagController|tagNotificationController|tagMonitoringController)\.([A-Za-z0-9_]+)/g

const controllerFamilies = {
  criticalTagController,
  tagNotificationController,
  tagMonitoringController,
}

function exportedControllerHandlerNames(): string[] {
  return Object.entries(controllerFamilies)
    .flatMap(([family, handlers]) => Object.keys(handlers).map((handler) => `${family}.${handler}`))
    .sort()
}

function routedControllerHandlerNames(routeSource: string): string[] {
  const routedHandlerNames = new Set<string>()
  for (const match of routeSource.matchAll(controllerHandlerReference)) {
    routedHandlerNames.add(`${match[1]}.${match[2]}`)
  }
  return [...routedHandlerNames].sort()
}

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => correlationId,
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/tag-monitoring', tagMonitoringRouter)
  app.use(errors.handler)
  return app
}

function expectedError(code: string, message: string) {
  return {
    success: false,
    code,
    message,
    correlationId,
  }
}

function expectRedacted(response: request.Response) {
  expect(response.headers['x-request-id']).toBe(correlationId)
  expect(JSON.stringify(response.body)).not.toContain('secret')
  expect(JSON.stringify(response.body)).not.toContain('alice@example.test')
  expect(JSON.stringify(response.body)).not.toContain('token=hidden')
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('every exported Tag Monitoring controller handler is mounted or intentionally private', () => {
  const exportedHandlerNames = exportedControllerHandlerNames()
  const routeSource = fs.readFileSync(tagMonitoringRouteSourcePath, 'utf8')
  const routedHandlerNames = routedControllerHandlerNames(routeSource)
  const publiclyMountedHandlerNames = exportedHandlerNames.filter(
    (name) => !privateHandlerNames.has(name),
  )

  expect(routedHandlerNames).toEqual(publiclyMountedHandlerNames)
  expect(exportedHandlerNames.filter((name) => !routedHandlerNames.includes(name) && !privateHandlerNames.has(name))).toEqual([])
  const removedHandler = 'tagNotificationController.dismissNotification'
  const mutatedRouteSource = routeSource.replace(removedHandler, '/* removed handler */')

  expect(routeSource).toContain(removedHandler)
  expect(routedControllerHandlerNames(mutatedRouteSource)).not.toContain(removedHandler)
  expect(routedControllerHandlerNames(mutatedRouteSource)).not.toEqual(
    exportedControllerHandlerNames(),
  )
})

test('monitoring stats failures use the central redacted error contract', async () => {
  jest.mocked(weeklyTagMonitoringService.getSnapshotStats).mockRejectedValueOnce(
    new Error('secret alice@example.test token=hidden'),
  )

  const response = await request(buildApp())
    .get('/api/tag-monitoring/stats')
    .query({ __bo2_offline_loopback: '1' })

  expect(response.status).toBe(500)
  expect(response.body).toEqual(
    expectedError('TAG_MONITORING_STATS_FAILED', 'Erro ao obter estat\u00edsticas'),
  )
  expectRedacted(response)
})

test('notification list failures use the central redacted error contract', async () => {
  jest.mocked(tagNotificationService.getNotifications).mockRejectedValueOnce(
    new Error('secret alice@example.test token=hidden'),
  )

  const response = await request(buildApp())
    .get('/api/tag-monitoring/notifications')
    .query({ __bo2_offline_loopback: '1' })

  expect(response.status).toBe(500)

  expect(response.body).toEqual(
    expectedError('TAG_NOTIFICATION_LIST_FAILED', 'Erro ao listar notifica\u00e7\u00f5es'),
  )
  expectRedacted(response)
})

test('critical tag list failures use the central redacted error contract', async () => {
  jest.mocked(criticalTagManagementService.getCriticalTags).mockRejectedValueOnce(
    new Error('secret alice@example.test token=hidden'),
  )

  const response = await request(buildApp())
    .get('/api/tag-monitoring/critical-tags')
    .query({ __bo2_offline_loopback: '1' })

  expect(response.status).toBe(500)
  expect(response.body).toEqual(
    expectedError('CRITICAL_TAG_LIST_FAILED', 'Erro ao listar tags cr\u00edticas'),
  )
  expectRedacted(response)
})
