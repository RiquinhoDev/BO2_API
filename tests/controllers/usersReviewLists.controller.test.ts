import type { NextFunction, Request, Response } from 'express'
import IdsDiferentes from '../../src/models/IdsDiferentes'
import UnmatchedUser from '../../src/models/UnmatchedUser'
import {
  getIdsDiferentes,
  getUnmatchedUsers,
} from '../../src/controllers/usersReviewLists.controller'
import { HttpError } from '../../src/security/errorHandling'

jest.mock('../../src/models/IdsDiferentes', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}))

jest.mock('../../src/models/UnmatchedUser', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}))

const idsModel = IdsDiferentes as unknown as {
  find: jest.Mock
  countDocuments: jest.Mock
}

const unmatchedModel = UnmatchedUser as unknown as {
  find: jest.Mock
  countDocuments: jest.Mock
}

const createQuery = (result: unknown[]) => {
  const query = {
    sort: jest.fn(),
    select: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn().mockResolvedValue(result),
  }

  query.sort.mockReturnValue(query)
  query.select.mockReturnValue(query)
  query.skip.mockReturnValue(query)
  query.limit.mockReturnValue(query)

  return query
}

const createResponse = () => {
  const json = jest.fn()
  const response = {
    json,
    status: jest.fn(),
  }
  response.status.mockReturnValue(response)

  return {
    json,
    response: response as unknown as Response,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('getIdsDiferentes applies default pagination and preserves its envelope', async () => {
  const idsDiferentes = [{ _id: 'different-id-1', __v: 0 }]
  const query = createQuery(idsDiferentes)
  const { json, response } = createResponse()
  idsModel.find.mockReturnValue(query)
  idsModel.countDocuments.mockResolvedValue(101)

  await getIdsDiferentes(
    { query: {} } as unknown as Request,
    response,
    jest.fn() as NextFunction,
  )

  expect(idsModel.find).toHaveBeenCalledWith({})
  expect(idsModel.countDocuments).toHaveBeenCalledWith({})
  expect(query.sort).toHaveBeenCalledWith({ detectedAt: -1, _id: -1 })
  expect(query.select).toHaveBeenCalledWith(
    '_id email previousDiscordIds newDiscordId detectedAt createdAt updatedAt __v',
  )
  expect(query.skip).toHaveBeenCalledWith(0)
  expect(query.limit).toHaveBeenCalledWith(50)
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: idsDiferentes,
    meta: { pagination: {
      page: 1,
      limit: 50,
      total: 101,
      pages: 3,
    } },
  })
})

test('getUnmatchedUsers clamps large limits and preserves its envelope', async () => {
  const unmatchedUsers = [{ _id: 'unmatched-user-1', __v: 0 }]
  const query = createQuery(unmatchedUsers)
  const { json, response } = createResponse()
  unmatchedModel.find.mockReturnValue(query)
  unmatchedModel.countDocuments.mockResolvedValue(401)

  await getUnmatchedUsers(
    { query: { page: '2', limit: '10000' } } as unknown as Request,
    response,
    jest.fn() as NextFunction,
  )

  expect(unmatchedModel.find).toHaveBeenCalledWith({})
  expect(unmatchedModel.countDocuments).toHaveBeenCalledWith({})
  expect(query.sort).toHaveBeenCalledWith({ detectedAt: -1, _id: -1 })
  expect(query.select).toHaveBeenCalledWith(
    '_id discordId username email name detectedAt createdAt updatedAt __v',
  )
  expect(query.skip).toHaveBeenCalledWith(200)
  expect(query.limit).toHaveBeenCalledWith(200)
  expect(response.status).toHaveBeenCalledWith(200)
  expect(json).toHaveBeenCalledWith({
    success: true,
    data: unmatchedUsers,
    meta: { pagination: {
      page: 2,
      limit: 200,
      total: 401,
      pages: 3,
    } },
  })
})

test.each([
  ['ids diferentes', getIdsDiferentes, idsModel, 'USERS_IDS_REVIEW_LIST_FAILED'],
  ['unmatched users', getUnmatchedUsers, unmatchedModel, 'USERS_UNMATCHED_REVIEW_LIST_FAILED'],
] as const)('%s forwards a typed internal error without sending locally', async (_label, handler, model, code) => {
  const cause = new Error('mongo failure for alice@example.test token=secret')
  const query = createQuery([])
  query.lean.mockRejectedValueOnce(cause)
  model.find.mockReturnValue(query)
  model.countDocuments.mockResolvedValue(0)
  const { response } = createResponse()
  const next = jest.fn()

  await handler({ query: {} } as unknown as Request, response, next)

  expect(response.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(expect.any(HttpError))
  expect(next.mock.calls[0][0]).toMatchObject({ status: 500, code, internalCause: cause })
})