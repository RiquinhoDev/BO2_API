import type { Request, Response } from 'express'
import IdsDiferentes from '../../src/models/IdsDiferentes'
import UnmatchedUser from '../../src/models/UnmatchedUser'
import {
  getIdsDiferentes,
  getUnmatchedUsers,
} from '../../src/controllers/usersReviewLists.controller'

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
    idsDiferentes,
    pagination: {
      page: 1,
      limit: 50,
      total: 101,
      pages: 3,
    },
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
    unmatchedUsers,
    pagination: {
      page: 2,
      limit: 200,
      total: 401,
      pages: 3,
    },
  })
})
