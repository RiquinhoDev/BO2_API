import type { NextFunction, Response } from 'express'
import { HttpError } from '../../src/security/errorHandling'
import {
  createGuruExternalInactivationHandlers,
} from '../../src/controllers/guruInactivationExternal.controller'
import {
  createGuruExternalInactivationService,
  type GuruExternalInactivationRepository,
} from '../../src/services/guru/guruExternalInactivation.service'
import type { CurseducaInactivationClient } from '../../src/services/guru/curseducaInactivation.client'

const repository = (): GuruExternalInactivationRepository => ({
  findOne: jest.fn(async () => undefined),
  findMany: jest.fn(async () => []),
  markDuplicates: jest.fn(async () => undefined),
  markInactive: jest.fn(async () => undefined),
  recordFailure: jest.fn(async () => undefined),
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
    createGuruExternalInactivationService(repo, client()),
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
    createGuruExternalInactivationService(repo, client()),
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