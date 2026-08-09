import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../src/security/errorHandling'
import {
  createGuruInactivationMutationHandlers,
  type GuruInactivationMutationService,
} from '../../src/controllers/guruInactivationMutation.controller'

const service = (): GuruInactivationMutationService => ({
  quarantine: jest.fn(async () => ({ kind: 'success' as const, email: 'a@x.test', modifiedCount: 1 })),
  revert: jest.fn(async () => ({ kind: 'success' as const })),
  cleanupDuplicates: jest.fn(async () => ({ modifiedCount: 1, requestedCount: 1, mode: 'inactive' as const })),
  markStale: jest.fn(async () => ({
    emailsRequested: 1,
    usersFound: 1,
    userProductsModified: 1,
    usersModified: 1,
  })),
  restore: jest.fn(async () => ({ modifiedCount: 1, requestedCount: 1 })),
  fixActive: jest.fn(async () => ({ updatedUsers: 1, updatedUserProducts: 1, results: [] })),
})

const response = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
} as unknown as Response)

test.each([
  ['quarantineUser', 'quarantine', { email: 'a@x.test' }, 'GURU_INACTIVATION_QUARANTINE_FAILED'],
  ['revertInactivationMark', 'revert', { userProductId: 'up-1' }, 'GURU_INACTIVATION_REVERT_FAILED'],
  ['cleanupDuplicateUserProducts', 'cleanupDuplicates', { userProductIds: ['up-1'] }, 'GURU_INACTIVATION_DUPLICATE_CLEANUP_FAILED'],
  ['markStaleInactive', 'markStale', { emails: ['a@x.test'] }, 'GURU_INACTIVATION_MARK_STALE_FAILED'],
  ['restoreUserProducts', 'restore', { userProductIds: ['up-1'] }, 'GURU_INACTIVATION_RESTORE_FAILED'],
  ['fixUsersToActive', 'fixActive', { emails: ['a@x.test'] }, 'GURU_INACTIVATION_FIX_ACTIVE_FAILED'],
] as const)('forwards opaque errors from %s', async (handler, method, body, code) => {
  const mutationService = service()
  jest.mocked(mutationService[method]).mockRejectedValueOnce(
    new Error('mongo token=secret alice@example.test'),
  )
  const res = response()
  const next: NextFunction = jest.fn()

  await createGuruInactivationMutationHandlers(mutationService)[handler](
    { body } as Request,
    res,
    next,
  )

  expect(res.status).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  const [error] = (next as jest.Mock).mock.calls[0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
})

test.each([
  ['quarantineUser', {}, 'Email é obrigatório'],
  ['revertInactivationMark', {}, 'Deve fornecer userProductId'],
  ['cleanupDuplicateUserProducts', { userProductIds: [1] }, 'Campo "userProductIds" obrigatório (array de strings)'],
  ['markStaleInactive', { emails: [1] }, 'Campo "emails" obrigatório (array de strings)'],
  ['restoreUserProducts', { userProductIds: [] }, 'Campo "userProductIds" obrigatório (array de strings)'],
  ['fixUsersToActive', { emails: [1] }, 'Campo "emails" obrigatório (array de strings)'],
] as const)('validates %s before invoking the service', async (handler, body, message) => {
  const mutationService = service()
  const res = response()

  await createGuruInactivationMutationHandlers(mutationService)[handler](
    { body } as unknown as Request,
    res,
    jest.fn(),
  )

  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith({ success: false, message })
})
