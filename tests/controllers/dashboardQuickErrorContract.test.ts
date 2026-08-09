import type { NextFunction, Request, Response } from 'express'
import UserProduct from '../../src/models/UserProduct'
import {
  getEngagementHeatmap,
  getProductComparison,
  getProductsBreakdown,
} from '../../src/controllers/dashboardQuick.controller'
import { HttpError } from '../../src/security/errorHandling'

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { aggregate: jest.fn() },
}))

const aggregate = UserProduct.aggregate as jest.Mock

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

test.each([
  ['product comparison', getProductComparison, 'DASHBOARD_QUICK_COMPARISON_FAILED'],
  ['products breakdown', getProductsBreakdown, 'DASHBOARD_QUICK_BREAKDOWN_FAILED'],
] as const)('%s forwards its cause to the central contract', async (_label, handler, code) => {
  const cause = new Error('mongo failed for alice@example.test token=secret')
  aggregate.mockRejectedValueOnce(cause)
  const response = responseDouble()
  const next = jest.fn()

  await handler({ query: {} } as Request, response, next as NextFunction)

  expect(response.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(expect.any(HttpError))
  expect(next.mock.calls[0][0]).toMatchObject({ status: 500, code, internalCause: cause })
})

test('engagement heatmap forwards unexpected calculation failures centrally', async () => {
  const cause = new Error('calculation failed token=secret')
  jest.spyOn(Math, 'random').mockImplementation(() => { throw cause })
  const response = responseDouble()
  const next = jest.fn()

  await getEngagementHeatmap({ query: {} } as Request, response, next as NextFunction)

  expect(response.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  expect(next.mock.calls[0][0]).toMatchObject({
    status: 500,
    code: 'DASHBOARD_QUICK_HEATMAP_FAILED',
    internalCause: cause,
  })
})

test('product comparison preserves its success envelope', async () => {
  aggregate.mockResolvedValueOnce([])
  const response = responseDouble()

  await getProductComparison({ query: {} } as Request, response, jest.fn() as NextFunction)

  expect(response.status).toHaveBeenCalledWith(200)
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: [],
    meta: expect.objectContaining({ method: 'mongodb-aggregation' }),
  }))
})