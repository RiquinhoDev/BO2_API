import type { RequestHandler } from 'express'
import request from 'supertest'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const mockAdminFindOne = jest.fn()
const mockAdminFindById = jest.fn()
jest.mock('../../src/models/Admin', () => ({
  __esModule: true,
  default: { findOne: mockAdminFindOne, findById: mockAdminFindById },
}))

const authenticate: RequestHandler = (req, _res, next) => {
  Object.defineProperty(req, 'user', { value: { id: 'admin-id' } })
  next()
}
const authorize = (): RequestHandler => (_req, _res, next) => { next() }
jest.mock('../../src/middleware/auth.middleware', () => ({ authenticate, authorize }))

const mockCronFindOne = jest.fn()
const mockCronFind = jest.fn()
jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: { findOne: mockCronFindOne, find: mockCronFind },
}))

const mockCollectMetrics = jest.fn()
const mockGetStats = jest.fn()
const mockGetHistory = jest.fn()
jest.mock('../../src/services/metrics.service', () => ({
  __esModule: true,
  default: {
    collectMetrics: mockCollectMetrics,
    getStats: mockGetStats,
    getHistory: mockGetHistory,
  },
}))

import authRouter from '../../src/routes/auth.routes'
import healthRouter from '../../src/routes/health.routes'
import metricsRouter from '../../src/routes/metrics.routes'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '?__bo2_offline_loopback=1'

interface Operation {
  name: string
  router: typeof authRouter
  mount: string
  method: 'get' | 'post'
  path: string
  arrange: (failure: unknown) => void
  code: string
  message: string
  body?: Record<string, unknown>
}

const operations: Operation[] = [
  { name: 'login', router: authRouter, mount: '/api/auth', method: 'post', path: '/login', body: { email: 'alice@example.test', password: 'secret' }, arrange: (failure) => mockAdminFindOne.mockImplementationOnce(() => { throw failure }), code: 'AUTH_LOGIN_FAILED', message: 'Erro ao fazer login' },
  { name: 'verify', router: authRouter, mount: '/api/auth', method: 'get', path: '/verify', arrange: (failure) => mockAdminFindById.mockImplementationOnce(() => { throw failure }), code: 'AUTH_VERIFY_FAILED', message: 'Erro ao verificar token' },
  { name: 'unlock', router: authRouter, mount: '/api/auth', method: 'post', path: '/unlock', body: { email: 'alice@example.test' }, arrange: (failure) => mockAdminFindOne.mockImplementationOnce(() => { throw failure }), code: 'AUTH_UNLOCK_FAILED', message: 'Erro ao desbloquear conta' },
  { name: 'change password', router: authRouter, mount: '/api/auth', method: 'post', path: '/change-password', body: { currentPassword: 'old-password', newPassword: 'new-password' }, arrange: (failure) => mockAdminFindById.mockImplementationOnce(() => { throw failure }), code: 'AUTH_PASSWORD_CHANGE_FAILED', message: 'Erro ao alterar password' },
  { name: 'health', router: healthRouter, mount: '/api', method: 'get', path: '/health', arrange: (failure) => mockCronFindOne.mockImplementationOnce(() => { throw failure }), code: 'HEALTH_READ_FAILED', message: 'Erro ao verificar saúde do sistema' },
  { name: 'metrics', router: metricsRouter, mount: '/api/metrics', method: 'get', path: '/', arrange: (failure) => mockCollectMetrics.mockImplementationOnce(() => { throw failure }), code: 'METRICS_READ_FAILED', message: 'Erro ao obter métricas' },
  { name: 'metrics history', router: metricsRouter, mount: '/api/metrics', method: 'get', path: '/history', arrange: (failure) => mockGetHistory.mockImplementationOnce(() => { throw failure }), code: 'METRICS_HISTORY_READ_FAILED', message: 'Erro ao obter histórico de métricas' },
  { name: 'cron metrics', router: metricsRouter, mount: '/api/metrics', method: 'get', path: '/cron', arrange: (failure) => mockCronFind.mockImplementationOnce(() => { throw failure }), code: 'CRON_METRICS_READ_FAILED', message: 'Erro ao obter métricas dos CRON jobs' },
]

describe('SEC-10 auth, health, metrics application boundary', () => {
  beforeEach(() => { jest.resetAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => undefined) })
  afterEach(() => { jest.restoreAllMocks() })

  it('covers the exact eight-site migration membership', () => { expect(operations).toHaveLength(8) })

  it.each(operations)('$name returns its redacted central envelope', async (operation) => {
    operation.arrange(secret)
    const pending = request(appForCentralError({ kind: 'router', mountPath: operation.mount, router: operation.router }))[operation.method](`${operation.mount}${operation.path}${offline}`)
    const response = operation.body === undefined ? await pending : await pending.send(operation.body)
    expectCentralError(response, { code: operation.code, message: operation.message })
  })

  it('normalizes non-Error failures', async () => {
    operations[5].arrange('secret token=hidden')
    const response = await request(appForCentralError({ kind: 'router', mountPath: '/api/metrics', router: metricsRouter })).get(`/api/metrics/${offline}`)
    expectCentralError(response, { code: 'METRICS_READ_FAILED', message: 'Erro ao obter métricas' })
  })

  it('preserves IntegrationUnavailable classification', async () => {
    operations[4].arrange(new IntegrationUnavailableError('hotmart'))
    const response = await request(appForCentralError({ kind: 'router', mountPath: '/api', router: healthRouter })).get(`/api/health${offline}`)
    expect(response.status).toBe(503)
    expect(response.body.code).toBe('INTEGRATION_UNAVAILABLE')
  })

  it('preserves login validation precedence', async () => {
    const response = await request(appForCentralError({ kind: 'router', mountPath: '/api/auth', router: authRouter })).post(`/api/auth/login${offline}`).send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ success: false, message: 'Email e password são obrigatórios' })
  })
})
