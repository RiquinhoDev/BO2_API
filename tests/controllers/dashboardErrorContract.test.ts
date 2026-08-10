import type { NextFunction, Request, Response } from 'express'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import { getAllUsersUnified } from '../../src/services/syncUtilizadoresServices/dualReadService'
import { getDashboardStats as readDashboardStats } from '../../src/services/dashboardStatsBuilder.service'
import {
  compareProducts,
  getDashboardStats,
  getDashboardStatsV3,
  getEngagementDistribution,
  getProductsBreakdown,
  searchDashboard,
} from '../../src/controllers/dashboard.controller'
import { HttpError } from '../../src/security/errorHandling'

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { aggregate: jest.fn(), find: jest.fn() },
}))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}))
jest.mock('../../src/services/syncUtilizadoresServices/dualReadService', () => ({
  getAllUsersUnified: jest.fn(),
}))
jest.mock('../../src/services/dashboardStatsBuilder.service', () => ({
  getDashboardStats: jest.fn(),
}))

const aggregate = UserProduct.aggregate as jest.Mock
const findUsers = User.find as jest.Mock
const readUnified = getAllUsersUnified as jest.Mock
const readStats = readDashboardStats as jest.Mock

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

function rejectingUserQuery(cause: Error) {
  const query = { limit: jest.fn(), select: jest.fn(), lean: jest.fn().mockRejectedValue(cause) }
  query.limit.mockReturnValue(query)
  query.select.mockReturnValue(query)
  return query
}

async function expectForwarded(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  request: Request,
  code: string,
) {
  const response = responseDouble()
  const next = jest.fn()
  await handler(request, response, next)
  expect(response.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(expect.any(HttpError))
  expect(next.mock.calls[0][0]).toMatchObject({ status: 500, code })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

test('dashboard stats forwards aggregate failures', async () => {
  aggregate.mockRejectedValueOnce(new Error('aggregate secret'))
  await expectForwarded(getDashboardStats, { query: {} } as Request, 'DASHBOARD_STATS_FAILED')
})

test('products breakdown forwards dual-read failures', async () => {
  readUnified.mockRejectedValueOnce(new Error('dual-read secret'))
  await expectForwarded(getProductsBreakdown, { query: {} } as Request, 'DASHBOARD_PRODUCTS_FAILED')
})

test('engagement distribution forwards aggregate failures', async () => {
  aggregate.mockRejectedValueOnce(new Error('engagement secret'))
  await expectForwarded(getEngagementDistribution, { query: {} } as Request, 'DASHBOARD_ENGAGEMENT_FAILED')
})

test('product comparison forwards aggregate failures', async () => {
  aggregate.mockRejectedValueOnce(new Error('comparison secret'))
  await expectForwarded(
    compareProducts,
    { query: { productId1: '507f1f77bcf86cd799439011', productId2: '507f191e810c19729de860ea' } } as unknown as Request,
    'DASHBOARD_COMPARISON_FAILED',
  )
})

test('stats v3 forwards builder failures', async () => {
  readStats.mockRejectedValueOnce(new Error('builder secret'))
  await expectForwarded(getDashboardStatsV3, { query: {} } as Request, 'DASHBOARD_STATS_V3_FAILED')
})

test('stats v3 reports a missing materialized view through a typed error', async () => {
  readStats.mockResolvedValueOnce(null)
  await expectForwarded(getDashboardStatsV3, { query: {} } as Request, 'DASHBOARD_STATS_UNAVAILABLE')
})

test('dashboard search forwards query failures', async () => {
  findUsers.mockReturnValueOnce(rejectingUserQuery(new Error('search secret')))
  await expectForwarded(searchDashboard, { query: { q: 'alice' } } as unknown as Request, 'DASHBOARD_SEARCH_FAILED')
})