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
    addCriticalTag: jest.fn(),
    removeCriticalTag: jest.fn(),
    deleteCriticalTag: jest.fn(),
    toggleCriticalTag: jest.fn(),
    updatePriority: jest.fn(),
    discoverNativeTagsFromSnapshots: jest.fn(),
    getStats: jest.fn(),
  },
  tagNotificationService: {
    getNotifications: jest.fn(),
    getNotificationById: jest.fn(),
    getNotificationDetails: jest.fn(),
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    dismissNotification: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllAsRead: jest.fn(),
    getStats: jest.fn(),
  },
  weeklyTagMonitoringService: {
    performWeeklySnapshot: jest.fn(),
    getSnapshotStats: jest.fn(),
    getStudentsByPriority: jest.fn(),
  },
}))

jest.mock('../../src/models/tagMonitoring', () => ({
  WeeklyNativeTagSnapshot: {
    find: jest.fn(),
    findByEmail: jest.fn(),
    findOne: jest.fn(),
    findByWeek: jest.fn(),
  },
  WeeklyTagMonitoringConfig: {
    getConfig: jest.fn(),
    updateScope: jest.fn(),
    toggleEnabled: jest.fn(),
  },
}))

import tagMonitoringRouter from '../../src/routes/tagMonitoring.routes'

const correlationId = 'tag-monitoring-request'
const offlineMarker = { __bo2_offline_loopback: '1' }
type SnapshotListFixture = { snapshotId: string }
type WeeklyStatsSnapshotFixture = { nativeTags: string[] }
type SnapshotChangesFixture = { added: string[]; removed: string[] }
type SnapshotComparisonFixture = {
  weekNumber: number
  year: number
  nativeTags: string[]
  capturedAt: string
  compareWith?: jest.Mock<SnapshotChangesFixture, [SnapshotComparisonFixture]>
}
type SnapshotFindLeanMock = jest.Mock<Promise<SnapshotListFixture[]>, []>
type SnapshotFindLimitMock = jest.Mock<{ lean: SnapshotFindLeanMock }, [number]>
type SnapshotFindSortMock = jest.Mock<
  { limit: SnapshotFindLimitMock },
  [{ capturedAt: number }]
>
type SnapshotModelMock = {
  find: jest.Mock<{ sort: SnapshotFindSortMock }, [Record<string, number>]>
  findByEmail: jest.Mock<Promise<SnapshotListFixture[]>, [string, number?]>
  findOne: jest.Mock<
    Promise<SnapshotComparisonFixture | null>,
    [{ email: string; weekNumber: number; year: number }]
  >
  findByWeek: jest.Mock<Promise<WeeklyStatsSnapshotFixture[]>, [number, number]>
}
type MonitoringConfigFixture = {
  scope: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
  enabled: boolean
  privateField?: string
}
type MonitoringConfigModelMock = {
  getConfig: jest.Mock<Promise<MonitoringConfigFixture>, []>
  updateScope: jest.Mock<Promise<MonitoringConfigFixture>, [MonitoringConfigFixture['scope']]>
  toggleEnabled: jest.Mock<Promise<MonitoringConfigFixture>, []>
}
type CriticalTagServiceMock = {
  getCriticalTags: jest.Mock<Promise<unknown[]>, [boolean?]>
  addCriticalTag: jest.Mock<Promise<unknown>, [string, string, string?, string?]>
  removeCriticalTag: jest.Mock<Promise<void>, [string]>
  deleteCriticalTag: jest.Mock<Promise<void>, [string]>
  toggleCriticalTag: jest.Mock<Promise<{ isActive: boolean }>, [string]>
  updatePriority: jest.Mock<Promise<unknown>, [string, string]>
  discoverNativeTagsFromSnapshots: jest.Mock<Promise<string[]>, [number?]>
  getStats: jest.Mock<Promise<unknown>, []>
}
const { criticalTagManagementService: criticalTagServiceMock } = jest.requireMock<{
  criticalTagManagementService: CriticalTagServiceMock
}>('../../src/services/tagMonitoring')
type NotificationServiceMock = {
  getNotifications: jest.Mock<Promise<unknown[]>, [Record<string, unknown>?]>
  getNotificationById: jest.Mock<Promise<unknown | null>, [string]>
  getNotificationDetails: jest.Mock<Promise<unknown[]>, [string]>
  markAsRead: jest.Mock<Promise<unknown>, [string]>
  markAsUnread: jest.Mock<Promise<unknown>, [string]>
  dismissNotification: jest.Mock<Promise<void>, [string]>
  getUnreadCount: jest.Mock<Promise<number>, []>
  markAllAsRead: jest.Mock<Promise<number>, []>
  getStats: jest.Mock<Promise<unknown>, []>
}
const { tagNotificationService: notificationServiceMock } = jest.requireMock<{
  tagNotificationService: NotificationServiceMock
}>('../../src/services/tagMonitoring')
const {
  WeeklyNativeTagSnapshot: snapshotsModel,
  WeeklyTagMonitoringConfig: monitoringConfigModel,
} = jest.requireMock<{
  WeeklyNativeTagSnapshot: SnapshotModelMock
  WeeklyTagMonitoringConfig: MonitoringConfigModelMock
}>('../../src/models/tagMonitoring')
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
  app.use((req, _res, next) => {
    req.user = {
      id: 'admin-1',
      email: 'admin@example.test',
      role: 'ADMIN',
      permissions: [],
    }
    next()
  })
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

function snapshotFindResult(snapshots: SnapshotListFixture[]) {
  const lean = jest.fn<Promise<SnapshotListFixture[]>, []>().mockResolvedValue(snapshots)
  const limit = jest.fn<{ lean: SnapshotFindLeanMock }, [number]>().mockReturnValue({ lean })
  const sort = jest.fn<
    { limit: SnapshotFindLimitMock },
    [{ capturedAt: number }]
  >().mockReturnValue({ limit })
  snapshotsModel.find.mockReturnValueOnce({ sort })
  return { sort, limit, lean }
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
const criticalTagFailureCases = [
  ['add', 'post', '/api/tag-monitoring/critical-tags', { tagName: 'vip' }, criticalTagServiceMock.addCriticalTag, 'CRITICAL_TAG_ADD_FAILED', 'Erro ao adicionar tag crítica'],
  ['soft delete', 'delete', '/api/tag-monitoring/critical-tags/tag-1', undefined, criticalTagServiceMock.removeCriticalTag, 'CRITICAL_TAG_REMOVE_FAILED', 'Erro ao remover tag crítica'],
  ['permanent delete', 'delete', '/api/tag-monitoring/critical-tags/507f1f77bcf86cd799439011/permanent', undefined, criticalTagServiceMock.deleteCriticalTag, 'CRITICAL_TAG_DELETE_FAILED', 'Erro ao deletar tag crítica'],
  ['toggle', 'patch', '/api/tag-monitoring/critical-tags/tag-1/toggle', undefined, criticalTagServiceMock.toggleCriticalTag, 'CRITICAL_TAG_TOGGLE_FAILED', 'Erro ao alternar tag crítica'],
  ['priority', 'patch', '/api/tag-monitoring/critical-tags/tag-1/priority', { priority: 'CRITICAL' }, criticalTagServiceMock.updatePriority, 'CRITICAL_TAG_PRIORITY_UPDATE_FAILED', 'Erro ao atualizar prioridade'],
  ['native tags', 'get', '/api/tag-monitoring/critical-tags/available-native-tags', undefined, criticalTagServiceMock.discoverNativeTagsFromSnapshots, 'CRITICAL_TAG_NATIVE_TAGS_FAILED', 'Erro ao descobrir tags nativas'],
  ['stats', 'get', '/api/tag-monitoring/critical-tags/stats', undefined, criticalTagServiceMock.getStats, 'CRITICAL_TAG_STATS_FAILED', 'Erro ao obter estatísticas'],
] as const

test.each(criticalTagFailureCases)(
  'critical tag $name failures use the central redacted error contract',
  async (_name, method, routePath, body, dependency, code, message) => {
    dependency.mockRejectedValueOnce(new Error('secret alice@example.test token=hidden'))
    let pending = request(buildApp())[method](routePath).query(offlineMarker)
    if (body) pending = pending.send(body)
    const response = await pending

    expect(response.status).toBe(500)
    expect(response.body).toEqual(expectedError(code, message))
    expectRedacted(response)
  },
)

test('critical tag list and create preserve filters, arguments and envelopes', async () => {
  const tags = [{ id: 'tag-1', tagName: 'vip', isActive: true }]
  criticalTagServiceMock.getCriticalTags.mockResolvedValueOnce(tags)
  const listed = await request(buildApp())
    .get('/api/tag-monitoring/critical-tags')
    .query({ ...offlineMarker, onlyActive: 'true' })
  expect(listed.status).toBe(200)
  expect(listed.body).toEqual({ success: true, data: tags, meta: { count: 1 } })
  expect(criticalTagServiceMock.getCriticalTags).toHaveBeenCalledWith(true)

  const tag = { id: 'tag-2', tagName: 'risk', priority: 'CRITICAL' }
  criticalTagServiceMock.addCriticalTag.mockResolvedValueOnce(tag)
  const created = await request(buildApp())
    .post('/api/tag-monitoring/critical-tags')
    .query(offlineMarker)
    .send({ tagName: 'risk', description: 'important', priority: 'CRITICAL' })
  expect(created.status).toBe(201)
  expect(created.body).toEqual({
    success: true,
    data: tag,
    meta: { message: 'Tag crítica adicionada com sucesso' },
  })
  expect(criticalTagServiceMock.addCriticalTag).toHaveBeenCalledWith(
    'risk', 'admin-1', 'important', 'CRITICAL',
  )
})

test('critical tag create preserves validation and conflict contracts', async () => {
  const missing = await request(buildApp())
    .post('/api/tag-monitoring/critical-tags').query(offlineMarker).send({})
  expect(missing.status).toBe(400)
  expect(missing.body).toEqual({ success: false, message: 'Nome da tag é obrigatório' })

  const invalid = await request(buildApp())
    .post('/api/tag-monitoring/critical-tags')
    .query(offlineMarker)
    .send({ tagName: 'vip', priority: 'HIGH' })
  expect(invalid.status).toBe(400)
  expect(invalid.body).toEqual({
    success: false,
    message: 'Prioridade inválida. Use: CRITICAL, MEDIUM ou LOW',
  })

  criticalTagServiceMock.addCriticalTag.mockRejectedValueOnce(
    new Error('Tag "vip" já está marcada como crítica'),
  )
  const conflict = await request(buildApp())
    .post('/api/tag-monitoring/critical-tags').query(offlineMarker).send({ tagName: 'vip' })
  expect(conflict.status).toBe(409)
  expect(conflict.body).toEqual({
    success: false,
    message: 'Tag "vip" já está marcada como crítica',
  })
})

test('critical tag soft and permanent delete preserve IDs, semantics and order', async () => {
  criticalTagServiceMock.removeCriticalTag.mockResolvedValueOnce()
  const soft = await request(buildApp())
    .delete('/api/tag-monitoring/critical-tags/tag-soft').query(offlineMarker)
  expect(soft.status).toBe(200)
  expect(soft.body).toEqual({
    success: true,
    data: null,
    meta: { message: 'Tag crítica removida com sucesso' },
  })
  expect(criticalTagServiceMock.removeCriticalTag).toHaveBeenCalledWith('tag-soft')

  criticalTagServiceMock.deleteCriticalTag.mockResolvedValueOnce()
  const permanent = await request(buildApp())
    .delete('/api/tag-monitoring/critical-tags/507f1f77bcf86cd799439011/permanent')
    .query(offlineMarker)
  expect(permanent.status).toBe(200)
  expect(permanent.body).toEqual({
    success: true,
    message: 'Tag crítica deletada permanentemente',
  })
  expect(criticalTagServiceMock.deleteCriticalTag).toHaveBeenCalledWith(
    '507f1f77bcf86cd799439011',
  )
  expect(criticalTagServiceMock.removeCriticalTag.mock.invocationCallOrder[0])
    .toBeLessThan(criticalTagServiceMock.deleteCriticalTag.mock.invocationCallOrder[0])
})

test('critical tag mutations preserve validation, IDs and response envelopes', async () => {
  const invalid = await request(buildApp())
    .patch('/api/tag-monitoring/critical-tags/tag-1/priority')
    .query(offlineMarker).send({ priority: 'HIGH' })
  expect(invalid.status).toBe(400)
  expect(invalid.body).toEqual({
    success: false,
    message: 'Prioridade inválida. Use: CRITICAL, MEDIUM ou LOW',
  })

  criticalTagServiceMock.toggleCriticalTag.mockResolvedValueOnce({ isActive: false })
  const toggled = await request(buildApp())
    .patch('/api/tag-monitoring/critical-tags/tag-1/toggle').query(offlineMarker)
  expect(toggled.body).toEqual({
    success: true,
    data: { isActive: false },
    meta: { message: 'Tag crítica desativada com sucesso' },
  })
  expect(criticalTagServiceMock.toggleCriticalTag).toHaveBeenCalledWith('tag-1')

  const updatedTag = { id: 'tag-1', priority: 'MEDIUM' }
  criticalTagServiceMock.updatePriority.mockResolvedValueOnce(updatedTag)
  const updated = await request(buildApp())
    .patch('/api/tag-monitoring/critical-tags/tag-1/priority')
    .query(offlineMarker).send({ priority: 'MEDIUM' })
  expect(updated.body).toEqual({
    success: true,
    data: updatedTag,
    meta: { message: 'Prioridade atualizada para MEDIUM' },
  })
  expect(criticalTagServiceMock.updatePriority).toHaveBeenCalledWith('tag-1', 'MEDIUM')
})

test('critical tag reads preserve query parsing and response envelopes', async () => {
  criticalTagServiceMock.discoverNativeTagsFromSnapshots.mockResolvedValueOnce(['a', 'b'])
  const available = await request(buildApp())
    .get('/api/tag-monitoring/critical-tags/available-native-tags')
    .query({ ...offlineMarker, weeksBack: '6' })
  expect(available.body).toEqual({
    success: true,
    data: ['a', 'b'],
    meta: { count: 2, weeksAnalyzed: 6 },
  })
  expect(criticalTagServiceMock.discoverNativeTagsFromSnapshots).toHaveBeenCalledWith(6)

  const stats = { total: 4, active: 3, inactive: 1 }
  criticalTagServiceMock.getStats.mockResolvedValueOnce(stats)
  const response = await request(buildApp())
    .get('/api/tag-monitoring/critical-tags/stats').query(offlineMarker)
  expect(response.body).toEqual({ success: true, data: stats })
})

test.each([
  ['soft delete', criticalTagServiceMock.removeCriticalTag, '/api/tag-monitoring/critical-tags/tag-1', 'delete'],
  ['permanent delete', criticalTagServiceMock.deleteCriticalTag, '/api/tag-monitoring/critical-tags/507f1f77bcf86cd799439011/permanent', 'delete'],
  ['toggle', criticalTagServiceMock.toggleCriticalTag, '/api/tag-monitoring/critical-tags/tag-1/toggle', 'patch'],
  ['priority', criticalTagServiceMock.updatePriority, '/api/tag-monitoring/critical-tags/tag-1/priority', 'patch'],
] as const)('critical tag %s preserves the not-found contract', async (_name, dependency, routePath, method) => {
  dependency.mockRejectedValueOnce(new Error('Tag crítica não encontrada'))
  let pending = request(buildApp())[method](routePath).query(offlineMarker)
  if (routePath.endsWith('/priority')) pending = pending.send({ priority: 'LOW' })
  const response = await pending
  expect(response.status).toBe(404)
  expect(response.body).toEqual({ success: false, message: 'Tag crítica não encontrada' })
})

test('snapshot list preserves filters, explicit limit and count envelope', async () => {
  const snapshots = [{ snapshotId: 'snapshot-1' }, { snapshotId: 'snapshot-2' }]
  const query = snapshotFindResult(snapshots)

  const response = await request(buildApp())
    .get('/api/tag-monitoring/snapshots')
    .query({ ...offlineMarker, weekNumber: '32', year: '2026', limit: '7' })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ success: true, data: snapshots, meta: { count: 2 } })
  expect(snapshotsModel.find).toHaveBeenCalledWith({ weekNumber: 32, year: 2026 })
  expect(query.sort).toHaveBeenCalledWith({ capturedAt: -1 })
  expect(query.limit).toHaveBeenCalledWith(7)
  expect(query.lean).toHaveBeenCalledTimes(1)
})

test('snapshot list preserves the default limit', async () => {
  const query = snapshotFindResult([])

  const response = await request(buildApp())
    .get('/api/tag-monitoring/snapshots')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ success: true, data: [], meta: { count: 0 } })
  expect(snapshotsModel.find).toHaveBeenCalledWith({})
  expect(query.limit).toHaveBeenCalledWith(100)
})

test('snapshot email history preserves its default limit, count and email', async () => {
  const snapshots = [{ snapshotId: 'snapshot-email' }]
  snapshotsModel.findByEmail.mockResolvedValueOnce(snapshots)

  const response = await request(buildApp())
    .get('/api/tag-monitoring/snapshots/user/alice%40example.test')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: snapshots,
    meta: { count: 1, email: 'alice@example.test' },
  })
  expect(snapshotsModel.findByEmail).toHaveBeenCalledWith('alice@example.test', 10)
})

test('snapshot email history preserves its missing-email validation body', async () => {
  const app = express()
  app.get<{ email: string }>('/missing-email', tagMonitoringController.getSnapshotsByEmail)

  const response = await request(app)
    .get('/missing-email')
    .query(offlineMarker)

  expect(response.status).toBe(400)
  expect(response.body).toEqual({
    success: false,
    message: 'Email \u00e9 obrigat\u00f3rio',
  })
  expect(snapshotsModel.findByEmail).not.toHaveBeenCalled()
})

test('snapshot comparison preserves its query, snapshots and changes envelope', async () => {
  const changes = { added: ['new-tag'], removed: ['old-tag'] }
  const snapshot1 = {
    weekNumber: 30,
    year: 2026,
    nativeTags: ['old-tag'],
    capturedAt: '2026-07-20T00:00:00.000Z',
  }
  const snapshot2 = {
    weekNumber: 31,
    year: 2026,
    nativeTags: ['new-tag'],
    capturedAt: '2026-07-27T00:00:00.000Z',
    compareWith: jest.fn().mockReturnValue(changes),
  }
  snapshotsModel.findOne
    .mockResolvedValueOnce(snapshot1)
    .mockResolvedValueOnce(snapshot2)

  const response = await request(buildApp())
    .get('/api/tag-monitoring/snapshots/compare')
    .query({
      ...offlineMarker,
      email: 'alice@example.test',
      week1: '30',
      year1: '2026',
      week2: '31',
      year2: '2026',
    })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: {
      snapshot1: {
        week: 30,
        year: 2026,
        tags: ['old-tag'],
        capturedAt: '2026-07-20T00:00:00.000Z',
      },
      snapshot2: {
        week: 31,
        year: 2026,
        tags: ['new-tag'],
        capturedAt: '2026-07-27T00:00:00.000Z',
      },
      changes,
    },
  })
  expect(snapshotsModel.findOne).toHaveBeenNthCalledWith(1, {
    email: 'alice@example.test',
    weekNumber: 30,
    year: 2026,
  })
  expect(snapshotsModel.findOne).toHaveBeenNthCalledWith(2, {
    email: 'alice@example.test',
    weekNumber: 31,
    year: 2026,
  })
  expect(snapshot2.compareWith).toHaveBeenCalledWith(snapshot1)
})

test('snapshot comparison preserves validation and missing-snapshot bodies', async () => {
  const invalid = await request(buildApp())
    .get('/api/tag-monitoring/snapshots/compare')
    .query(offlineMarker)

  expect(invalid.status).toBe(400)
  expect(invalid.body).toEqual({
    success: false,
    message: 'Email, week1, year1, week2 e year2 s\u00e3o obrigat\u00f3rios',
  })

  snapshotsModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
  const missing = await request(buildApp())
    .get('/api/tag-monitoring/snapshots/compare')
    .query({
      ...offlineMarker,
      email: 'alice@example.test',
      week1: '30',
      year1: '2026',
      week2: '31',
      year2: '2026',
    })

  expect(missing.status).toBe(404)
  expect(missing.body).toEqual({
    success: false,
    message: 'Um ou ambos os snapshots n\u00e3o foram encontrados',
  })
})

test('manual snapshot preserves the service result envelope', async () => {
  const result: Awaited<
    ReturnType<typeof weeklyTagMonitoringService.performWeeklySnapshot>
  > = {
    success: true,
    totalStudents: 12,
    snapshotsCreated: 12,
    changesDetected: 3,
    notificationsCreated: 3,
    duration: '1s',
    errors: 0,
    mode: 'STUDENTS_ONLY',
  }
  jest.mocked(weeklyTagMonitoringService.performWeeklySnapshot).mockResolvedValueOnce(result)

  const response = await request(buildApp())
    .post('/api/tag-monitoring/snapshots/manual')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: result,
    meta: { message: 'Snapshot manual executado com sucesso' },
  })
  expect(weeklyTagMonitoringService.performWeeklySnapshot).toHaveBeenCalledTimes(1)
})
test('global stats preserve the service result envelope', async () => {
  const stats = { totalSnapshots: 42, activeStudents: 9 }
  jest.mocked(weeklyTagMonitoringService.getSnapshotStats).mockResolvedValueOnce(stats)

  const response = await request(buildApp())
    .get('/api/tag-monitoring/stats')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ success: true, data: stats })
})

test('weekly stats preserve numeric parsing and derived values', async () => {
  snapshotsModel.findByWeek.mockResolvedValueOnce([
    { nativeTags: ['tag-1', 'tag-2'] },
    { nativeTags: ['tag-3'] },
  ])

  const response = await request(buildApp())
    .get('/api/tag-monitoring/stats/weekly')
    .query({ ...offlineMarker, weekNumber: '32', year: '2026' })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: {
      weekNumber: 32,
      year: 2026,
      totalSnapshots: 2,
      totalTags: 3,
      avgTagsPerStudent: '1.50',
    },
  })
  expect(snapshotsModel.findByWeek).toHaveBeenCalledWith(32, 2026)
})

test('weekly stats preserve the missing-query validation body', async () => {
  const response = await request(buildApp())
    .get('/api/tag-monitoring/stats/weekly')
    .query(offlineMarker)

  expect(response.status).toBe(400)
  expect(response.body).toEqual({
    success: false,
    message: 'weekNumber e year s\u00e3o obrigat\u00f3rios',
  })
  expect(snapshotsModel.findByWeek).not.toHaveBeenCalled()
})

test('scope config preserves its response envelope', async () => {
  monitoringConfigModel.getConfig.mockResolvedValueOnce({
    scope: 'STUDENTS_ONLY',
    enabled: true,
    privateField: 'not-public',
  })

  const response = await request(buildApp())
    .get('/api/tag-monitoring/config/scope')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: { scope: 'STUDENTS_ONLY', enabled: true },
  })
})

test('scope update preserves validation, service input and response envelope', async () => {
  const invalid = await request(buildApp())
    .patch('/api/tag-monitoring/config/scope')
    .query(offlineMarker)
    .send({ scope: 'INVALID' })

  expect(invalid.status).toBe(400)
  expect(invalid.body).toEqual({
    success: false,
    message: 'Scope inv\u00e1lido. Use STUDENTS_ONLY ou ALL_CONTACTS',
  })

  monitoringConfigModel.updateScope.mockResolvedValueOnce({
    scope: 'ALL_CONTACTS',
    enabled: false,
  })
  const updated = await request(buildApp())
    .patch('/api/tag-monitoring/config/scope')
    .query(offlineMarker)
    .send({ scope: 'ALL_CONTACTS' })

  expect(updated.status).toBe(200)
  expect(updated.body).toEqual({
    success: true,
    data: { scope: 'ALL_CONTACTS', enabled: false },
    meta: { message: 'Configura\u00e7\u00e3o atualizada com sucesso' },
  })
  expect(monitoringConfigModel.updateScope).toHaveBeenCalledWith('ALL_CONTACTS')
})

test('monitoring toggle preserves its dynamic message and config envelope', async () => {
  monitoringConfigModel.toggleEnabled.mockResolvedValueOnce({
    scope: 'STUDENTS_ONLY',
    enabled: false,
  })

  const response = await request(buildApp())
    .patch('/api/tag-monitoring/config/toggle')
    .query(offlineMarker)

  expect(response.status).toBe(200)
  expect(response.body).toEqual({
    success: true,
    data: { scope: 'STUDENTS_ONLY', enabled: false },
    meta: { message: 'Sistema desativado com sucesso' },
  })
})

test('students by priority preserves array parsing and pagination defaults', async () => {
  const result: Awaited<
    ReturnType<typeof weeklyTagMonitoringService.getStudentsByPriority>
  > = {
    students: [{
      _id: 'student-1',
      name: 'Alice',
      email: 'alice@example.test',
      tags: [{ name: 'vip', priority: 'CRITICAL' }],
      products: ['course-1'],
    }],
    total: 1,
    page: 1,
    totalPages: 1,
  }
  jest.mocked(weeklyTagMonitoringService.getStudentsByPriority).mockResolvedValueOnce(result)

  const response = await request(buildApp())
    .get('/api/tag-monitoring/students-by-priority')
    .query({
      ...offlineMarker,
      priorities: ['CRITICAL', 'LOW'],
      tagName: 'vip',
    })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ success: true, data: result })
  expect(weeklyTagMonitoringService.getStudentsByPriority).toHaveBeenCalledWith({
    priorities: ['CRITICAL', 'LOW'],
    tagName: 'vip',
    limit: 20,
    skip: 0,
  })
})
test.each([
  {
    name: 'snapshot list',
    reject: () => snapshotsModel.find.mockImplementationOnce(() => {
      throw new Error('secret alice@example.test token=hidden')
    }),
    call: () => request(buildApp()).get('/api/tag-monitoring/snapshots').query(offlineMarker),
    code: 'TAG_MONITORING_SNAPSHOT_LIST_FAILED',
    message: 'Erro ao listar snapshots',
  },
  {
    name: 'snapshot email history',
    reject: () => snapshotsModel.findByEmail.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .get('/api/tag-monitoring/snapshots/user/alice%40example.test')
      .query(offlineMarker),
    code: 'TAG_MONITORING_SNAPSHOT_EMAIL_LIST_FAILED',
    message: 'Erro ao buscar snapshots',
  },
  {
    name: 'snapshot comparison',
    reject: () => snapshotsModel.findOne.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .get('/api/tag-monitoring/snapshots/compare')
      .query({
        ...offlineMarker,
        email: 'alice@example.test',
        week1: '30',
        year1: '2026',
        week2: '31',
        year2: '2026',
      }),
    code: 'TAG_MONITORING_SNAPSHOT_COMPARE_FAILED',
    message: 'Erro ao comparar snapshots',
  },
  {
    name: 'manual snapshot',
    reject: () => jest.mocked(weeklyTagMonitoringService.performWeeklySnapshot).mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .post('/api/tag-monitoring/snapshots/manual')
      .query(offlineMarker),
    code: 'TAG_MONITORING_SNAPSHOT_MANUAL_FAILED',
    message: 'Erro ao executar snapshot manual',
  },
  {
    name: 'weekly stats',
    reject: () => snapshotsModel.findByWeek.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .get('/api/tag-monitoring/stats/weekly')
      .query({ ...offlineMarker, weekNumber: '32', year: '2026' }),
    code: 'TAG_MONITORING_WEEKLY_STATS_FAILED',
    message: 'Erro ao obter estat\u00edsticas semanais',
  },
  {
    name: 'scope config read',
    reject: () => monitoringConfigModel.getConfig.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp()).get('/api/tag-monitoring/config/scope').query(offlineMarker),
    code: 'TAG_MONITORING_SCOPE_CONFIG_GET_FAILED',
    message: 'Erro ao buscar configura\u00e7\u00e3o',
  },
  {
    name: 'scope config update',
    reject: () => monitoringConfigModel.updateScope.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .patch('/api/tag-monitoring/config/scope')
      .query(offlineMarker)
      .send({ scope: 'ALL_CONTACTS' }),
    code: 'TAG_MONITORING_SCOPE_CONFIG_UPDATE_FAILED',
    message: 'Erro ao atualizar configura\u00e7\u00e3o',
  },
  {
    name: 'monitoring toggle',
    reject: () => monitoringConfigModel.toggleEnabled.mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp()).patch('/api/tag-monitoring/config/toggle').query(offlineMarker),
    code: 'TAG_MONITORING_TOGGLE_FAILED',
    message: 'Erro ao alternar sistema',
  },
  {
    name: 'students by priority',
    reject: () => jest.mocked(weeklyTagMonitoringService.getStudentsByPriority).mockRejectedValueOnce(
      new Error('secret alice@example.test token=hidden'),
    ),
    call: () => request(buildApp())
      .get('/api/tag-monitoring/students-by-priority')
      .query(offlineMarker),
    code: 'TAG_MONITORING_STUDENTS_BY_PRIORITY_FAILED',
    message: 'Erro ao buscar alunos por prioridade',
  },
])('$name failures use a distinct central redacted error contract', async ({
  reject,
  call,
  code,
  message,
}) => {
  reject()

  const response = await call()

  expect(response.status).toBe(500)
  expect(response.body).toEqual(expectedError(code, message))
  expectRedacted(response)
})

const notificationFailureCases = [
  {
    name: 'detail',
    reject: (cause: Error) => notificationServiceMock.getNotificationById.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).get('/api/tag-monitoring/notifications/n-1').query(offlineMarker),
    code: 'TAG_NOTIFICATION_DETAIL_FAILED',
    message: 'Erro ao buscar notifica\u00e7\u00e3o',
  },
  {
    name: 'details',
    reject: (cause: Error) => notificationServiceMock.getNotificationDetails.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).get('/api/tag-monitoring/notifications/n-1/details').query(offlineMarker),
    code: 'TAG_NOTIFICATION_DETAILS_FAILED',
    message: 'Erro ao buscar detalhes',
  },
  {
    name: 'read',
    reject: (cause: Error) => notificationServiceMock.markAsRead.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).patch('/api/tag-monitoring/notifications/n-1/read').query(offlineMarker),
    code: 'TAG_NOTIFICATION_MARK_READ_FAILED',
    message: 'Erro ao marcar como lida',
  },
  {
    name: 'unread',
    reject: (cause: Error) => notificationServiceMock.markAsUnread.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).patch('/api/tag-monitoring/notifications/n-1/unread').query(offlineMarker),
    code: 'TAG_NOTIFICATION_MARK_UNREAD_FAILED',
    message: 'Erro ao marcar como n\u00e3o lida',
  },
  {
    name: 'dismiss',
    reject: (cause: Error) => notificationServiceMock.dismissNotification.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).delete('/api/tag-monitoring/notifications/507f1f77bcf86cd799439011').query(offlineMarker),
    code: 'TAG_NOTIFICATION_DISMISS_FAILED',
    message: 'Erro ao remover notifica\u00e7\u00e3o',
  },
  {
    name: 'unread count',
    reject: (cause: Error) => notificationServiceMock.getUnreadCount.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).get('/api/tag-monitoring/notifications/unread/count').query(offlineMarker),
    code: 'TAG_NOTIFICATION_UNREAD_COUNT_FAILED',
    message: 'Erro ao obter contagem',
  },
  {
    name: 'mark all read',
    reject: (cause: Error) => notificationServiceMock.markAllAsRead.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).patch('/api/tag-monitoring/notifications/mark-all-read').query(offlineMarker),
    code: 'TAG_NOTIFICATION_MARK_ALL_READ_FAILED',
    message: 'Erro ao marcar todas como lidas',
  },
  {
    name: 'stats',
    reject: (cause: Error) => notificationServiceMock.getStats.mockRejectedValueOnce(cause),
    send: () => request(buildApp()).get('/api/tag-monitoring/notifications/stats').query(offlineMarker),
    code: 'TAG_NOTIFICATION_STATS_FAILED',
    message: 'Erro ao obter estat\u00edsticas',
  },
]

test.each(notificationFailureCases)(
  'notification $name failures use the central redacted error contract',
  async ({ reject, send, code, message }) => {
    reject(new Error('secret alice@example.test token=hidden'))
    const response = await send()

    expect(response.status).toBe(500)
    expect(response.body).toEqual(expectedError(code, message))
    expectRedacted(response)
  },
)

test('notification outcomes preserve success and not-found contracts', async () => {
  const notification = { id: 'n-1', tagName: 'vip', isRead: false }
  const details = [{ id: 'd-1', email: 'student@example.test' }]
  const stats = { total: 3, unread: 2, byType: { added: 2, removed: 1 } }

  notificationServiceMock.getNotifications.mockResolvedValueOnce([notification])
  notificationServiceMock.getNotificationById
    .mockResolvedValueOnce(notification)
    .mockResolvedValueOnce(null)
  notificationServiceMock.getNotificationDetails.mockResolvedValueOnce(details)
  notificationServiceMock.markAsRead.mockResolvedValueOnce({ ...notification, isRead: true })
  notificationServiceMock.markAsUnread.mockResolvedValueOnce(notification)
  notificationServiceMock.dismissNotification.mockResolvedValueOnce()
  notificationServiceMock.getUnreadCount.mockResolvedValueOnce(2)
  notificationServiceMock.markAllAsRead.mockResolvedValueOnce(2)
  notificationServiceMock.getStats.mockResolvedValueOnce(stats)

  const app = buildApp()
  const list = await request(app).get('/api/tag-monitoring/notifications').query({
    ...offlineMarker,
    isRead: 'false',
    limit: '7',
    skip: '2',
    weekNumber: '32',
    year: '2026',
    tagName: 'vip',
  })
  const detail = await request(app).get('/api/tag-monitoring/notifications/n-1').query(offlineMarker)
  const missing = await request(app).get('/api/tag-monitoring/notifications/missing').query(offlineMarker)
  const detailList = await request(app).get('/api/tag-monitoring/notifications/n-1/details').query(offlineMarker)
  const read = await request(app).patch('/api/tag-monitoring/notifications/n-1/read').query(offlineMarker)
  const unread = await request(app).patch('/api/tag-monitoring/notifications/n-1/unread').query(offlineMarker)
  const dismissed = await request(app).delete('/api/tag-monitoring/notifications/507f1f77bcf86cd799439011').query(offlineMarker)
  const unreadCount = await request(app).get('/api/tag-monitoring/notifications/unread/count').query(offlineMarker)
  const allRead = await request(app).patch('/api/tag-monitoring/notifications/mark-all-read').query(offlineMarker)
  const statsResponse = await request(app).get('/api/tag-monitoring/notifications/stats').query(offlineMarker)

  expect(list.body).toEqual({
    success: true,
    data: [notification],
    meta: {
      count: 1,
      filters: { isRead: false, limit: 7, skip: 2, weekNumber: 32, year: 2026, tagName: 'vip' },
    },
  })
  expect(detail.body).toEqual({ success: true, data: notification })
  expect(missing.status).toBe(404)
  expect(missing.body).toEqual({ success: false, message: 'Notifica\u00e7\u00e3o n\u00e3o encontrada' })
  expect(detailList.body).toEqual({ success: true, data: details, meta: { count: 1 } })
  expect(read.body).toEqual({ success: true, data: { ...notification, isRead: true }, meta: { message: 'Notifica\u00e7\u00e3o marcada como lida' } })
  expect(unread.body).toEqual({ success: true, data: notification, meta: { message: 'Notifica\u00e7\u00e3o marcada como n\u00e3o lida' } })
  expect(dismissed.body).toEqual({ success: true, data: null, meta: { message: 'Notifica\u00e7\u00e3o removida com sucesso' } })
  expect(unreadCount.body).toEqual({ success: true, data: { count: 2 } })
  expect(allRead.body).toEqual({ success: true, data: { count: 2 }, meta: { message: '2 notifica\u00e7\u00f5es marcadas como lidas' } })
  expect(statsResponse.body).toEqual({ success: true, data: stats })
})

test.each([
  ['read', () => notificationServiceMock.markAsRead.mockRejectedValueOnce(new Error('Notifica\u00e7\u00e3o n\u00e3o encontrada')), 'patch', '/api/tag-monitoring/notifications/n-1/read'],
  ['unread', () => notificationServiceMock.markAsUnread.mockRejectedValueOnce(new Error('Notifica\u00e7\u00e3o n\u00e3o encontrada')), 'patch', '/api/tag-monitoring/notifications/n-1/unread'],
  ['dismiss', () => notificationServiceMock.dismissNotification.mockRejectedValueOnce(new Error('Notifica\u00e7\u00e3o n\u00e3o encontrada')), 'delete', '/api/tag-monitoring/notifications/507f1f77bcf86cd799439011'],
])('notification %s preserves its not-found response', async (_name, reject, method, url) => {
  reject()
  const response = method === 'patch'
    ? await request(buildApp()).patch(url).query(offlineMarker)
    : await request(buildApp()).delete(url).query(offlineMarker)

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ success: false, message: 'Notifica\u00e7\u00e3o n\u00e3o encontrada' })
})
