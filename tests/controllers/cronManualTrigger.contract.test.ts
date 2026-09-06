import type { NextFunction, Request, Response } from 'express'

const mockExecuteJobManually = jest.fn()

jest.mock('../../src/services/cron/scheduler', () => ({
  __esModule: true,
  default: { executeJobManually: mockExecuteJobManually },
}))

import { triggerJob } from '../../src/controllers/syncUtilizadoresControllers/cronManagement/commands.controller'

const id = '507f1f77bcf86cd799439011'
const plan = {
  operation: 'cron-execution-cleanup',
  dryRun: true,
  totalBefore: 30_000,
  eligible: 20_000,
  wouldDelete: 20_000,
  minimumToKeep: 100,
  limit: 20_000,
  truncated: true,
  remaining: 1,
}
const achievementPlan = {
  operation: 'achievement-evaluation',
  dryRun: true,
  matching: 20_000,
  evaluated: 20_000,
  wouldEvaluate: 20_000,
  limit: 20_000,
  truncated: true,
  remaining: 1,
}

function response() {
  return {
    locals: { correlationId: 'correlation-id' },
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

function request(dryRun: boolean): Request {
  return {
    user: { id: 'actor-id' },
    get: jest.fn(() => 'request-id'),
  } as unknown as Request
}

test('manual dry-run returns the complete cleanup plan', async () => {
  mockExecuteJobManually.mockResolvedValueOnce({
    success: true,
    duration: 1,
    stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
    dryRun: true,
    plan,
  })
  const res = response()

  await triggerJob(
    { params: { id }, body: { dryRun: true } } as never,
    request(true) as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: {
      executionSucceeded: true,
      duration: 1,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 },
      errorMessage: undefined,
      dryRun: true,
      plan,
    },
    meta: { message: 'Plano do job calculado sem efeitos' },
  })
})

test('live cleanup response stays compatible and does not expose the preview plan', async () => {
  mockExecuteJobManually.mockResolvedValueOnce({
    success: true,
    duration: 1,
    stats: { total: 20_000, inserted: 0, updated: 20_000, errors: 0, skipped: 0 },
    plan,
  })
  const res = response()

  await triggerJob(
    { params: { id }, body: { dryRun: false } } as never,
    request(false) as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.not.objectContaining({ plan }),
    meta: { message: 'Job executado com sucesso' },
  }))
})

test('achievement evaluation dry-run exposes its bounded plan and live response stays compatible', async () => {
  mockExecuteJobManually.mockResolvedValueOnce({
    success: true,
    duration: 1,
    stats: { total: 20_000, inserted: 0, updated: 0, errors: 0, skipped: 0 },
    dryRun: true,
    plan: achievementPlan,
  })
  const res = response()

  await triggerJob(
    { params: { id }, body: { dryRun: true } } as never,
    request(true) as Request,
    res as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ dryRun: true, plan: achievementPlan }),
    meta: { message: 'Plano do job calculado sem efeitos' },
  }))

  mockExecuteJobManually.mockResolvedValueOnce({
    success: true,
    duration: 1,
    stats: { total: 20_000, inserted: 0, updated: 20_000, errors: 0, skipped: 0 },
  })
  const liveResponse = response()
  await triggerJob(
    { params: { id }, body: { dryRun: false } } as never,
    request(false) as Request,
    liveResponse as unknown as Response,
    jest.fn() as NextFunction,
  )

  expect(liveResponse.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.not.objectContaining({ plan: expect.anything() }),
    meta: { message: 'Job executado com sucesso' },
  }))
})
