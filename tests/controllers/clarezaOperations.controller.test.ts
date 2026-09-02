import type { NextFunction, Request, Response } from 'express'

import { createClarezaOperationsController } from '../../src/controllers/clarezaOperations.controller'

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() } as unknown as Response
  ;(response.status as jest.Mock).mockReturnValue(response)
  return response
}

describe('Clareza operational boundary', () => {
  it('runs the canonical refresh through the existing leased coordinator', async () => {
    const refresh = jest.fn().mockResolvedValue({ success: true, total: 879, errors: 0 })
    const aliases = jest.fn()
    const handler = createClarezaOperationsController({ refresh, aliases })
    const response = responseDouble()

    await handler({ body: { operation: 'refresh' } } as Request, response, jest.fn())

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(aliases).not.toHaveBeenCalled()
    expect(response.json).toHaveBeenCalledWith({
      success: true, data: { operation: 'refresh', success: true, total: 879, errors: 0 },
    })
  })

  it('runs a bounded alias batch and rejects invalid operational input', async () => {
    const aliases = jest.fn().mockResolvedValue({ status: 'published', processed: 2 })
    const handler = createClarezaOperationsController({ refresh: jest.fn(), aliases })
    const response = responseDouble()

    await handler({ body: { operation: 'aliases', limit: 2, tickers: ['CSP1.L'] } } as Request, response, jest.fn())
    expect(aliases).toHaveBeenCalledWith({ limit: 2, tickers: ['CSP1.L'] })
    expect(response.json).toHaveBeenCalledWith({
      success: true, data: { operation: 'aliases', status: 'published', processed: 2 },
    })

    const invalidResponse = responseDouble()
    await handler({ body: { operation: 'aliases', limit: 41 } } as Request, invalidResponse, jest.fn() as NextFunction)
    expect(invalidResponse.status).toHaveBeenCalledWith(400)
  })
})
