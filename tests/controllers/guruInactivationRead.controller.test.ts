import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../src/security/errorHandling'
import {
  createGuruInactivationReadHandlers,
  type GuruInactivationReadService,
} from '../../src/controllers/guruInactivationRead.controller'

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response
}

const successfulService = (): GuruInactivationReadService => ({
  listPending: jest.fn(async () => ({
    count: 1,
    total: 2,
    filtered: 0,
    deduplicated: 1,
    pendingList: [{ email: 'alice@example.test' }],
  })),
  getStats: jest.fn(async () => ({
    pendingInactivation: 1,
    pendingInactivationTotal: 2,
    inactivatedToday: 3,
    totalInactivatedByGuru: 4,
  })),
  listInactive: jest.fn(async () => ({
    total: 1,
    page: 1,
    limit: 50,
    pages: 1,
    inactivatedList: [{ email: 'alice@example.test' }],
  })),
})

test('preserves the three successful read envelopes', async () => {
  const service = successfulService()
  const handlers = createGuruInactivationReadHandlers(service)
  const next: NextFunction = jest.fn()

  const pendingResponse = response()
  await handlers.listPendingInactivation({} as Request, pendingResponse, next)
  expect(pendingResponse.json).toHaveBeenCalledWith({
    success: true,
    data: {
      count: 1,
      total: 2,
      filtered: 0,
      deduplicated: 1,
      pendingList: [{ email: 'alice@example.test' }],
    },
  })

  const statsResponse = response()
  await handlers.getInactivationStats({} as Request, statsResponse, next)
  expect(statsResponse.json).toHaveBeenCalledWith({
    success: true,
    data: {
      pendingInactivation: 1,
      pendingInactivationTotal: 2,
      inactivatedToday: 3,
      totalInactivatedByGuru: 4,
    },
  })

  const inactiveResponse = response()
  await handlers.listInactivated(
    { query: { page: '1', limit: '50' } } as unknown as Request,
    inactiveResponse,
    next,
  )
  expect(inactiveResponse.json).toHaveBeenCalledWith({
    success: true,
    data: {
      total: 1,
      page: 1,
      limit: 50,
      pages: 1,
      inactivatedList: [{ email: 'alice@example.test' }],
    },
  })
  expect(next).not.toHaveBeenCalled()
})

test.each([
  ['listPendingInactivation', 'GURU_INACTIVATION_PENDING_LIST_FAILED'],
  ['getInactivationStats', 'GURU_INACTIVATION_STATS_FAILED'],
  ['listInactivated', 'GURU_INACTIVATION_INACTIVE_LIST_FAILED'],
] as const)('forwards opaque errors from %s', async (handlerName, code) => {
  const failure = new Error('mongo token=secret alice@example.test')
  const service = successfulService()
  const method = handlerName === 'listPendingInactivation'
    ? 'listPending'
    : handlerName === 'getInactivationStats'
      ? 'getStats'
      : 'listInactive'
  jest.mocked(service[method]).mockRejectedValueOnce(failure)
  const handlers = createGuruInactivationReadHandlers(service)
  const res = response()
  const next: NextFunction = jest.fn()

  await handlers[handlerName]({ query: {} } as Request, res, next)

  expect(res.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  const [error] = (next as jest.Mock).mock.calls[0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
})
