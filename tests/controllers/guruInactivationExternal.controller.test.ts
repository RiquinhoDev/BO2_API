import express from 'express'
import type { NextFunction, Response } from 'express'
import request from 'supertest'
import { createErrorHandling, HttpError } from '../../src/security/errorHandling'
import {
  createGuruExternalInactivationHandlers,
} from '../../src/controllers/guruInactivationExternal.controller'
import {
  createGuruExternalInactivationService,
  type GuruExternalInactivationRepository,
} from '../../src/services/guru/guruExternalInactivation.service'
import type { CurseducaInactivationClient } from '../../src/services/guru/curseducaInactivation.client'

const repository = (
  overrides: Partial<GuruExternalInactivationRepository> = {},
): GuruExternalInactivationRepository => ({
  findOne: jest.fn(async () => undefined),
  findMany: jest.fn(async () => []),
  markDuplicates: jest.fn(async () => undefined),
  claimInactivation: jest.fn(async () => true),
  releaseInactivationClaim: jest.fn(async () => undefined),
  markInactive: jest.fn(async () => undefined),
  recordFailure: jest.fn(async () => undefined),
  ...overrides,
})

const client = (): CurseducaInactivationClient => ({
  async inactivate() {
    return { success: true, response: {} }
  },
})

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response)

test('single forwards opaque repository failures to the central error handler', async () => {
  const repo = repository()
  jest.mocked(repo.findOne).mockRejectedValueOnce(new Error('mongo token=secret'))
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, client(), { enabled: () => true }),
  )
  const next: NextFunction = jest.fn()

  await handlers.inactivateSingle({
    params: {},
    query: {},
    body: { userProductId: '0123456789abcdef01234567' },
  }, response(), next)

  const error = jest.mocked(next).mock.calls[0][0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code: 'GURU_INACTIVATION_SINGLE_FAILED' })
})

test('bulk forwards opaque repository failures to the central error handler', async () => {
  const repo = repository()
  jest.mocked(repo.findMany).mockRejectedValueOnce(new Error('mongo token=secret'))
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, client(), { enabled: () => true }),
  )
  const next: NextFunction = jest.fn()

  await handlers.inactivateBulk({
    params: {},
    query: {},
    body: { all: true },
  }, response(), next)

  const error = jest.mocked(next).mock.calls[0][0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code: 'GURU_INACTIVATION_BULK_FAILED' })
})

test('single forwards a canonical 503 error and performs no reads when switch is disabled', async () => {
  const repo = repository()
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, client()),
  )
  const next = jest.fn()

  await handlers.inactivateSingle({
    params: {},
    query: {},
    body: { userProductId: '0123456789abcdef01234567' },
  }, response(), next)

  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    status: 503,
    code: 'GURU_INACTIVATION_DISABLED',
    publicMessage: 'Inativação CursEduca desativada',
  }))
  expect(repo.findOne).not.toHaveBeenCalled()
})

test('single forwards a canonical 409 error when another claim owns the enrollment', async () => {
  const repo = repository({
    findOne: jest.fn(async () => ({
      id: 'product-1',
      userId: 'user-1',
      memberId: 'member-1',
      hasCurseducaUser: true,
    })),
    claimInactivation: jest.fn(async () => false),
  })
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, client(), { enabled: () => true }),
  )
  const next = jest.fn()

  await handlers.inactivateSingle({
    params: {},
    query: {},
    body: { userProductId: '0123456789abcdef01234567' },
  }, response(), next)

  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    status: 409,
    code: 'GURU_INACTIVATION_IN_PROGRESS',
  }))
})

test('switch and cap errors render the canonical code/correlation envelope', async () => {
  const disabledHandlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repository(), client()),
  )
  const cappedRepo = repository({
    findMany: jest.fn(async () => Array.from({ length: 201 }, (_, index) => ({
      id: `product-${index}`,
      userId: `user-${index}`,
      memberId: `member-${index}`,
      hasCurseducaUser: true,
    }))),
  })
  const cappedHandlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(cappedRepo, client(), { enabled: () => true }),
  )
  const app = express()
  app.use(express.json())
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'guru-inactivation-test',
    logError: jest.fn(),
  })
  app.use(errorHandling.correlationId)
  app.post('/disabled', (req, res, next) => {
    void disabledHandlers.inactivateSingle({ params: {}, query: {}, body: req.body }, res, next)
  })
  app.post('/capped', (req, res, next) => {
    void cappedHandlers.inactivateBulk({ params: {}, query: {}, body: req.body }, res, next)
  })
  app.use(errorHandling.handler)

  const disabled = await request(app)
    .post('/disabled')
    .query({ __bo2_offline_loopback: '1' })
    .send({ userProductId: '0123456789abcdef01234567' })
    .expect(503)
  const capped = await request(app)
    .post('/capped')
    .query({ __bo2_offline_loopback: '1' })
    .send({ all: true })
    .expect(413)

  expect(disabled.body).toEqual({
    success: false,
    code: 'GURU_INACTIVATION_DISABLED',
    message: 'Inativação CursEduca desativada',
    correlationId: 'guru-inactivation-test',
  })
  expect(capped.body).toEqual({
    success: false,
    code: 'GURU_INACTIVATION_LIMIT_EXCEEDED',
    message: 'Inativação CursEduca limitada a 200 registos por execução',
    correlationId: 'guru-inactivation-test',
  })
})

test('bulk forwards a canonical 413 error when all mode exceeds the finite cap', async () => {
  const repo = repository()
  jest.mocked(repo.findMany).mockResolvedValueOnce(Array.from({ length: 201 }, (_, index) => ({
    id: `product-${index}`,
    userId: `user-${index}`,
    memberId: `member-${index}`,
    email: `user-${index}@example.test`,
    hasCurseducaUser: true,
  })))
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, client(), { enabled: () => true }),
  )
  const next = jest.fn()

  await handlers.inactivateBulk({
    params: {},
    query: {},
    body: { all: true },
  }, response(), next)

  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    status: 413,
    code: 'GURU_INACTIVATION_LIMIT_EXCEEDED',
    publicMessage: 'Inativação CursEduca limitada a 200 registos por execução',
  }))
})

test('single dry-run returns a plan without provider or local mutation', async () => {
  const repo = repository({
    findOne: jest.fn(async () => ({
      id: 'product-1',
      userId: 'user-1',
      memberId: 'member-1',
      email: 'user-1@example.test',
      hasCurseducaUser: true,
    })),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: {} }))
  const handlers = createGuruExternalInactivationHandlers(
    createGuruExternalInactivationService(repo, { inactivate }, { enabled: () => true }),
  )
  const res = response()

  await handlers.inactivateSingle({
    params: {},
    query: {},
    body: { userProductId: '0123456789abcdef01234567', dryRun: true },
  }, res, jest.fn())

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ dryRun: true, planned: true }),
  }))
  expect(inactivate).not.toHaveBeenCalled()
  expect(repo.markInactive).not.toHaveBeenCalled()
})
