import type { NextFunction, Request, Response } from 'express'

const mockExecuteNamedJobManually = jest.fn()

jest.mock('../../src/services/cron/scheduler', () => ({
  __esModule: true,
  default: { executeNamedJobManually: mockExecuteNamedJobManually },
}))
jest.mock('../../src/services/renewal/renewalSync.service', () => ({
  syncRenewalOffers: jest.fn(),
}))

import { runSync } from '../../src/controllers/renewal.controller'

function response() {
  return {
    locals: { correlationId: 'correlation-id' },
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

test('specialised Renewal Offers sync uses the canonical named guarded execution path', async () => {
  mockExecuteNamedJobManually.mockResolvedValueOnce({
    success: true,
    duration: 2,
    stats: { total: 2, inserted: 1, updated: 0, errors: 0, skipped: 1 },
    dryRun: true,
    plan: {
      operation: 'renewal-offer-sync',
      dryRun: true,
      create: 1,
      update: 0,
      reactivate: 0,
      deactivate: 0,
      unchanged: 1,
      totalOperations: 1,
      limit: 20_000,
      remaining: 0,
      truncated: false,
      anomaly: false,
    },
  })
  const req = {
    user: { id: 'actor-id' },
    body: { dryRun: true },
    get: jest.fn((name: string) => name === 'x-request-id' ? 'request-id' : undefined),
  } as unknown as Request
  const res = response()

  await runSync(req, res as unknown as Response, jest.fn() as NextFunction)

  expect(mockExecuteNamedJobManually).toHaveBeenCalledWith(
    'RenewalOfferSync',
    expect.anything(),
    expect.objectContaining({ actorId: 'actor-id', requestId: 'request-id', dryRun: true }),
  )
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    data: expect.objectContaining({
      executionSucceeded: true,
      dryRun: true,
      plan: expect.objectContaining({ operation: 'renewal-offer-sync' }),
    }),
  }))
})
