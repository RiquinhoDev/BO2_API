import type { NextFunction, Request, Response } from 'express'
import guruSyncService from '../../src/services/guru/guruSync.service'
import User from '../../src/models/user'
import {
  getSyncStats,
  listUsersWithGuru,
  previewSync,
  syncAllFromGuru,
  syncEmailFromGuru,
} from '../../src/controllers/guru.sync.controller'
import { HttpError } from '../../src/security/errorHandling'

jest.mock('../../src/services/guru/guruSync.service', () => ({
  __esModule: true,
  default: {
    syncAllSubscriptions: jest.fn(),
    checkEmailInGuru: jest.fn(),
    fetchAllSubscriptions: jest.fn(),
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
    find: jest.fn(),
  },
}))

const syncService = guruSyncService as jest.Mocked<typeof guruSyncService>
const countUsers = User.countDocuments as jest.Mock
const findUsers = User.find as jest.Mock

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response
}

function request(overrides: Partial<Request> = {}): Request {
  return { params: {}, query: {}, ...overrides } as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => jest.restoreAllMocks())

test.each([
  ['sync all', syncAllFromGuru, () => syncService.syncAllSubscriptions.mockRejectedValueOnce(new Error('guru token=secret alice@example.test')), request(), 'GURU_SYNC_ALL_FAILED'],
  ['sync email', syncEmailFromGuru, () => syncService.checkEmailInGuru.mockRejectedValueOnce(new Error('guru token=secret alice@example.test')), request({ params: { email: 'alice@example.test' } }), 'GURU_SYNC_EMAIL_FAILED'],
  ['sync stats', getSyncStats, () => countUsers.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), request(), 'GURU_SYNC_STATS_FAILED'],
  ['sync preview', previewSync, () => syncService.fetchAllSubscriptions.mockRejectedValueOnce(new Error('guru token=secret alice@example.test')), request(), 'GURU_SYNC_PREVIEW_FAILED'],
  ['sync users', listUsersWithGuru, () => findUsers.mockImplementationOnce(() => { throw new Error('mongo token=secret alice@example.test') }), request(), 'GURU_SYNC_USERS_FAILED'],
] as const)('%s forwards an opaque typed error', async (_name, handler, arrange, req, code) => {
  arrange()
  const res = response()
  const next: NextFunction = jest.fn()

  await Reflect.apply(handler, undefined, [req, res, next])

  expect(res.status).not.toHaveBeenCalled()
  expect(res.json).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  const [error] = (next as jest.Mock).mock.calls[0]
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 500, code })
  expect(error.publicMessage).not.toContain('secret')
  expect(error.internalCause).toBeInstanceOf(Error)
})

test('sync all preserves its success envelope and always releases its lock', async () => {
  syncService.syncAllSubscriptions.mockResolvedValueOnce({
    total: 1,
    created: 1,
    updated: 0,
    skipped: 0,
    errors: 0,
    markedForInactivation: 0,
    uniqueEmails: 1,
    multiSubEmails: 0,
    details: [],
  })
  const res = response()

  await Reflect.apply(syncAllFromGuru, undefined, [request(), res, jest.fn()])

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    result: expect.objectContaining({ total: 1, created: 1, crossReference: null }),
  }))
  expect((globalThis as Record<string, unknown>).guru_sync_running).toBe(false)
})
