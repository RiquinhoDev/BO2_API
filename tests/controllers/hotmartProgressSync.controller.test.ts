import type { Request, Response } from 'express'

const mockSyncCreate = jest.fn()
const mockSyncUpdate = jest.fn()
const mockUserFind = jest.fn()
const mockUserUpdate = jest.fn()
const mockGetAccessToken = jest.fn()
const mockListUserLessons = jest.fn()

jest.mock('../../src/models', () => ({
  Class: {},
  SyncHistory: {
    create: mockSyncCreate,
    findByIdAndUpdate: mockSyncUpdate
  },
  User: {
    find: mockUserFind,
    findByIdAndUpdate: mockUserUpdate
  }
}))

jest.mock('../../src/services/hotmart/hotmartLegacyClient', () => ({
  hotmartLegacyClient: {
    getAccessToken: mockGetAccessToken,
    listUsersPage: jest.fn(),
    listUserLessons: mockListUserLessons
  }
}))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync: jest.fn() }
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: jest.fn() }
}))

import { syncProgressOnly } from '../../src/controllers/hotmart/hotmartProgress.controller'

function response() {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  return { status, json }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSyncCreate.mockResolvedValue({ _id: 'sync-id' })
  mockSyncUpdate.mockResolvedValue(null)
  mockGetAccessToken.mockResolvedValue('token')
})

test('completes with the stable zero-user response and no user writes', async () => {
  const select = jest.fn().mockResolvedValue([])
  mockUserFind.mockReturnValue({ select })
  const res = response()

  await syncProgressOnly({} as Request, res as unknown as Response)

  expect(mockUserFind).toHaveBeenCalledWith({
    'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }
  })
  expect(select).toHaveBeenCalledWith('_id email name hotmart.hotmartUserId')
  expect(mockUserUpdate).not.toHaveBeenCalled()
  expect(mockSyncUpdate).toHaveBeenLastCalledWith('sync-id', expect.objectContaining({
    status: 'completed',
    stats: { total: 0, errors: 0 }
  }))
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({
    message: 'Nenhum utilizador com Hotmart ID encontrado para sincronização de progresso',
    stats: { total: 0, errors: 0 }
  })
})

test('persists lesson progress and reports exact counters', async () => {
  jest.useFakeTimers()
  const user = { _id: 'user-id', email: 'student@example.test', hotmart: { hotmartUserId: 'hotmart-id' } }
  const select = jest.fn().mockResolvedValue([user])
  mockUserFind.mockReturnValue({ select })
  mockListUserLessons.mockResolvedValue([{
    page_id: 'lesson-id',
    page_name: 'Lesson',
    module_name: 'Module',
    is_module_extra: false,
    is_completed: true,
    completed_date: 1_700_000_000_000
  }])
  mockUserUpdate.mockResolvedValue(null)
  const res = response()

  const pending = syncProgressOnly({} as Request, res as unknown as Response)
  await jest.advanceTimersByTimeAsync(150)
  await pending
  jest.useRealTimers()

  expect(mockUserUpdate).toHaveBeenCalledWith('user-id', expect.objectContaining({
    'hotmart.progress': expect.objectContaining({
      completedLessons: 1,
      lessonsData: [expect.objectContaining({ lessonId: 'lesson-id', completed: true })]
    })
  }))
  expect(res.json).toHaveBeenCalledWith({
    message: 'Sincronização de progresso concluída!',
    stats: { total: 1, withProgress: 1, errors: 0 }
  })
})

test('marks the sync failed and preserves the public 500 contract', async () => {
  mockGetAccessToken.mockRejectedValue(new Error('token failed'))
  const res = response()

  await syncProgressOnly({} as Request, res as unknown as Response)

  expect(mockSyncUpdate).toHaveBeenLastCalledWith('sync-id', expect.objectContaining({
    status: 'failed',
    errorDetails: ['token failed']
  }))
  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.json).toHaveBeenCalledWith({
    message: 'Erro na sincronização de progresso',
    error: 'token failed'
  })
})
