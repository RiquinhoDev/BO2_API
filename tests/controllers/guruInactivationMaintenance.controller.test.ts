import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../src/security/errorHandling'
import { createGuruInactivationMaintenanceHandlers } from '../../src/controllers/guruInactivationMaintenance.controller'
import type { GuruInactivationMaintenanceService } from '../../src/services/guru/guruInactivationMaintenance.service'

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response)

const service = (): GuruInactivationMaintenanceService => ({
  cleanup: jest.fn(async () => ({
    cleanedInactive: 0,
    cleanedGuruActive: 0,
    kept: 0,
    total: 0,
    details: [],
  })),
  diagnose: jest.fn(async () => []),
})

test('rejects an invalid diagnose payload at the boundary', async () => {
  const handlers = createGuruInactivationMaintenanceHandlers(service())
  const res = response()
  const next: NextFunction = jest.fn()

  await handlers.diagnoseUsers({ body: { emails: [] } } as Request, res, next)

  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Campo "emails" obrigatório (array de strings)',
  })
  expect(next).not.toHaveBeenCalled()
})

test.each([
  ['cleanupInactivationList', 'cleanup', 'GURU_INACTIVATION_CLEANUP_FAILED'],
  ['diagnoseUsers', 'diagnose', 'GURU_INACTIVATION_DIAGNOSE_FAILED'],
] as const)('forwards opaque errors from %s', async (handlerName, method, code) => {
  const maintenance = service()
  jest.mocked(maintenance[method]).mockRejectedValueOnce(new Error('mongo token=secret'))
  const handlers = createGuruInactivationMaintenanceHandlers(maintenance)
  const res = response()
  const next: NextFunction = jest.fn()
  const req = handlerName === 'diagnoseUsers'
    ? { body: { emails: ['alice@example.test'] } } as Request
    : {} as Request

  await handlers[handlerName](req, res, next)

  expect(res.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  const error: unknown = (next as jest.Mock).mock.calls[0][0]
  expect(error).toBeInstanceOf(HttpError)
  if (!(error instanceof HttpError)) throw new Error('expected HttpError')
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
})