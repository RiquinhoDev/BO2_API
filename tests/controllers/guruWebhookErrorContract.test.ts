import type { NextFunction, Request, Response } from 'express'
import requestAgent from 'supertest'
import GuruWebhook from '../../src/models/GuruWebhook'
import User from '../../src/models/user'
import { HttpError } from '../../src/security/errorHandling'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getGuruAccountToken: jest.fn(() => 'offline-guru-token'),
}))
jest.mock('../../src/models/GuruWebhook', () => ({
  __esModule: true,
  default: {
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { aggregate: jest.fn() },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {},
}))
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}))

import {
  getGuruStats,
  handleGuruWebhook,
  listWebhooksGroupedByMonth,
  migrateWebhookSource,
  reprocessWebhook,
} from '../../src/controllers/guru.webhook.controller'
import logger from '../../src/utils/logger'

const loggerWarnMock = jest.mocked(logger.warn)

const webhookModel = GuruWebhook as unknown as {
  aggregate: jest.Mock
  countDocuments: jest.Mock
  find: jest.Mock
  findById: jest.Mock
  findOne: jest.Mock
  findOneAndUpdate: jest.Mock
}
const aggregateUsers = User.aggregate as jest.Mock

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response
}

function request(overrides: Partial<Request> = {}): Request {
  return { body: {}, headers: {}, params: {}, query: {}, ...overrides } as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  webhookModel.findOneAndUpdate.mockResolvedValue(null)
  aggregateUsers.mockResolvedValue([])
})

afterEach(() => jest.restoreAllMocks())

test.each([
  ['grouped webhooks', listWebhooksGroupedByMonth, () => webhookModel.aggregate.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), request(), 'GURU_WEBHOOK_GROUPING_FAILED'],
  ['webhook stats', getGuruStats, () => webhookModel.countDocuments.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), request(), 'GURU_WEBHOOK_STATS_FAILED'],
  ['webhook reprocess', reprocessWebhook, () => webhookModel.findById.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), request({ params: { id: '507f1f77bcf86cd799439011' } }), 'GURU_WEBHOOK_REPROCESS_FAILED'],
  ['webhook migration', migrateWebhookSource, () => webhookModel.find.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), request(), 'GURU_WEBHOOK_MIGRATION_FAILED'],
] as const)('%s forwards an opaque typed error', async (_name, handler, arrange, req, code) => {
  arrange()
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(handler, undefined, [req, res, next])

  expect(res.status).not.toHaveBeenCalled()
  expect(res.json).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  const [error] = (next as jest.Mock).mock.calls[0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
})

test('webhook processing records the failure before forwarding it', async () => {
  const original = new Error('mongo token=secret alice@example.test')
  webhookModel.findOne.mockRejectedValueOnce(original)
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(handleGuruWebhook, undefined, [request({
    headers: { 'x-request-id': 'request-123' },
    body: { api_token: 'offline-guru-token' },
  }), res, next])

  expect(webhookModel.findOneAndUpdate).toHaveBeenCalledWith(
    { requestId: 'request-123' },
    expect.objectContaining({ error: original.message, processed: true }),
  )
  expect(webhookModel.findOneAndUpdate.mock.invocationCallOrder[0])
    .toBeLessThan((next as jest.Mock).mock.invocationCallOrder[0])
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    code: 'GURU_WEBHOOK_PROCESSING_FAILED',
    internalCause: original,
  }))
  expect(res.status).not.toHaveBeenCalled()
})

test('compensation failure never replaces the original webhook failure', async () => {
  const original = new Error('primary failure token=primary-secret')
  webhookModel.findOne.mockRejectedValueOnce(original)
  webhookModel.findOneAndUpdate.mockRejectedValueOnce(
    new Error('compensation alice%40example.test token=compensation-secret'),
  )
  const centralLogger = jest.fn()
  const forwardedErrors: unknown[] = []
  const next: NextFunction = (error) => {
    forwardedErrors.push(error)
  }

  await Reflect.apply(handleGuruWebhook, undefined, [request({
    headers: { 'x-request-id': 'request-456' },
    body: { api_token: 'offline-guru-token' },
  }), response(), next])

  const [forwardedError] = forwardedErrors
  const result = await requestAgent(appForCentralError({
    kind: 'handler',
    method: 'post',
    handler: (_req, _res, boundaryNext) => boundaryNext(forwardedError),
  }, 'request-456', centralLogger))
    .post('/target?__bo2_offline_loopback=1')
    .set('X-Request-ID', 'request-456')
    .send({})

  expect(forwardedError).toMatchObject({
    status: 500,
    code: 'GURU_WEBHOOK_PROCESSING_FAILED',
    internalCause: original,
  })
  expectCentralError(result, {
    code: 'GURU_WEBHOOK_PROCESSING_FAILED',
    message: 'Erro ao processar webhook Guru',
    correlationId: 'request-456',
  })
  expect(console.error).not.toHaveBeenCalled()
  expect(loggerWarnMock).toHaveBeenCalledTimes(1)
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Guru webhook failure persistence failed',
    { requestId: 'request-456', stage: 'failure-persistence', status: 'failed' },
  )
  expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toMatch(
    /alice(?:%40|@)example\.test|compensation-secret|primary-secret/,
  )
  expect(centralLogger).toHaveBeenCalledTimes(1)
  expect(centralLogger).toHaveBeenCalledWith(expect.objectContaining({
    code: 'GURU_WEBHOOK_PROCESSING_FAILED',
    correlationId: 'request-456',
    status: 500,
  }))
})

test('duplicate webhook preserves its success envelope', async () => {
  webhookModel.findOne.mockResolvedValueOnce({ _id: 'existing' })
  const res = response()

  await Reflect.apply(handleGuruWebhook, undefined, [request({
    headers: { 'x-request-id': 'request-duplicate' },
    body: { api_token: 'offline-guru-token' },
  }), res, jest.fn()])

  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    message: 'Webhook já processado',
    duplicate: true,
    requestId: 'request-duplicate',
  })
})
