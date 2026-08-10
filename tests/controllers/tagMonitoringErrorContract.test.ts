import fs from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'
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
const routesIndexSourcePath = path.resolve(__dirname, '../../src/routes/index.ts')
const registerRoutesSourcePath = path.resolve(__dirname, '../../src/runtime/registerRoutes.ts')
const controllerObjectNames = new Set([
  'criticalTagController',
  'tagNotificationController',
  'tagMonitoringController',
])
const routerMethodNames = new Set(['get', 'post', 'patch', 'delete'])
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

function parseTypeScript(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function isRouterRouteCall(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'router'
    && routerMethodNames.has(node.expression.name.text)
}

function addControllerReferences(node: ts.Node, handlerNames: Set<string>) {
  if (
    ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && controllerObjectNames.has(node.expression.text)
  ) {
    handlerNames.add(`${node.expression.text}.${node.name.text}`)
  }
  ts.forEachChild(node, (child) => addControllerReferences(child, handlerNames))
}

function routedControllerHandlerNames(routeSource: string): string[] {
  const routedHandlerNames = new Set<string>()
  const sourceFile = parseTypeScript(tagMonitoringRouteSourcePath, routeSource)

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isRouterRouteCall(node)) {
      node.arguments.forEach((argument) => addControllerReferences(argument, routedHandlerNames))
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...routedHandlerNames].sort()
}

function hasDefaultImport(source: string, modulePath: string, localName: string): boolean {
  const sourceFile = parseTypeScript(modulePath, source)
  return sourceFile.statements.some((statement) =>
    ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === modulePath
      && statement.importClause?.name?.text === localName,
  )
}

function hasRouterUseMount(
  source: string,
  receiver: string,
  mountedPath: string,
  handler: string,
): boolean {
  const sourceFile = parseTypeScript(receiver, source)
  let foundMount = false

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === receiver
      && node.expression.name.text === 'use'
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === mountedPath
      && node.arguments.slice(1).some((argument) => ts.isIdentifier(argument) && argument.text === handler)
    ) {
      foundMount = true
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return foundMount
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

test('production API mounts every exported Tag Monitoring controller handler', () => {
  const exportedHandlerNames = exportedControllerHandlerNames()
  const routeSource = fs.readFileSync(tagMonitoringRouteSourcePath, 'utf8')
  const routedHandlerNames = routedControllerHandlerNames(routeSource)
  const publiclyMountedHandlerNames = exportedHandlerNames.filter(
    (name) => !privateHandlerNames.has(name),
  )
  const removedHandler = 'tagNotificationController.dismissNotification'
  const mutatedRouteSource = routeSource.replace(removedHandler, 'dismissNotification')
  const commentOnlyRouteSource = `${mutatedRouteSource}\n// ${removedHandler}`
  const routesIndexSource = fs.readFileSync(routesIndexSourcePath, 'utf8')
  const registerRoutesSource = fs.readFileSync(registerRoutesSourcePath, 'utf8')

  expect(routedHandlerNames).toEqual(publiclyMountedHandlerNames)
  expect(exportedHandlerNames.filter((name) => !routedHandlerNames.includes(name) && !privateHandlerNames.has(name))).toEqual([])

  expect(routeSource).toContain(removedHandler)
  expect(routedControllerHandlerNames(mutatedRouteSource)).not.toContain(removedHandler)
  expect(routedControllerHandlerNames(mutatedRouteSource)).not.toEqual(
    publiclyMountedHandlerNames,
  )
  expect(routedControllerHandlerNames(commentOnlyRouteSource)).toEqual(
    routedControllerHandlerNames(mutatedRouteSource),
  )
  expect(routedControllerHandlerNames(commentOnlyRouteSource)).not.toContain(removedHandler)

  expect(hasDefaultImport(routesIndexSource, './tagMonitoring.routes', 'tagMonitoringRoutes')).toBe(true)
  expect(hasRouterUseMount(routesIndexSource, 'router', '/tag-monitoring', 'tagMonitoringRoutes')).toBe(true)
  expect(hasDefaultImport(registerRoutesSource, '../routes', 'router')).toBe(true)
  expect(hasRouterUseMount(registerRoutesSource, 'app', '/api', 'router')).toBe(true)
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
