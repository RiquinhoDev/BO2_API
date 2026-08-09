import type { Request, Response } from 'express'

const mockSyncCreate = jest.fn()
const mockSyncUpdate = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserFind = jest.fn()
const mockUserBulkWrite = jest.fn()
const mockUserUpdate = jest.fn()
const mockClassFindOne = jest.fn()
const mockClassCreate = jest.fn()
const mockHistoryBulkWrite = jest.fn()
const mockGetAccessToken = jest.fn()
const mockListUsersPage = jest.fn()
const mockListUserLessons = jest.fn()
const mockClearCache = jest.fn()
const mockBuildStats = jest.fn()

jest.mock('../../src/models', () => ({
  Class: { findOne: mockClassFindOne, create: mockClassCreate },
  SyncHistory: { create: mockSyncCreate, findByIdAndUpdate: mockSyncUpdate },
  User: {
    findOne: mockUserFindOne,
    find: mockUserFind,
    findByIdAndUpdate: mockUserUpdate,
    bulkWrite: mockUserBulkWrite
  }
}))

jest.mock('../../src/models/UserHistory', () => ({
  ensureUserHistoryModel: () => ({ bulkWrite: mockHistoryBulkWrite })
}))

jest.mock('../../src/services/hotmart/hotmartLegacyClient', () => ({
  hotmartLegacyClient: {
    getAccessToken: mockGetAccessToken,
    listUsersPage: mockListUsersPage,
    listUserLessons: mockListUserLessons
  }
}))

jest.mock('../../src/services/syncUtilizadoresServices/dualReadService', () => ({
  clearUnifiedCache: mockClearCache
}))

jest.mock('../../src/services/dashboardStatsBuilder.service', () => ({
  buildDashboardStats: mockBuildStats
}))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync: jest.fn() }
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: jest.fn() }
}))

import { syncHotmartUsers } from '../../src/controllers/hotmart/hotmartLegacySync.controller'

function response() {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  return { status, json }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-08-10T10:00:00.000Z'))
  mockSyncCreate.mockResolvedValue({ _id: 'sync-id' })
  mockSyncUpdate.mockResolvedValue(null)
  mockGetAccessToken.mockResolvedValue('token')
  mockBuildStats.mockResolvedValue(undefined)
})

afterEach(() => jest.useRealTimers())

test('marks an empty Hotmart response failed without writing users', async () => {
  mockListUsersPage.mockResolvedValue({ users: [], nextPageToken: null })
  const res = response()

  const pending = syncHotmartUsers({} as Request, res as unknown as Response)
  await jest.advanceTimersByTimeAsync(200)
  await pending

  expect(mockUserBulkWrite).not.toHaveBeenCalled()
  expect(mockSyncUpdate).toHaveBeenLastCalledWith('sync-id', expect.objectContaining({
    status: 'failed',
    errorDetails: ['Nenhum utilizador encontrado na API da Hotmart']
  }))
  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Erro crítico na sincronização com Hotmart',
    error: 'Nenhum utilizador encontrado na API da Hotmart'
  }))
})

test('persists a valid learner, creates its class, rebuilds stats and reports exact counters', async () => {
  mockListUsersPage.mockResolvedValue({
    users: [{
      email: ' Student@Example.test ',
      name: ' Student ',
      id: 'hotmart-id',
      class_id: 'class-1',
      engagement: 'HIGH',
      access_count: 3
    }],
    nextPageToken: null
  })
  mockListUserLessons.mockResolvedValue([{
    page_id: 'lesson-id', page_name: 'Lesson', module_name: 'Module',
    is_module_extra: false, is_completed: true
  }])
  mockUserFindOne.mockResolvedValue(null)
  const existingLean = jest.fn().mockResolvedValue([])
  const existingSelect = jest.fn().mockReturnValue({ lean: existingLean })
  const engagementLean = jest.fn().mockResolvedValue([])
  mockUserFind
    .mockReturnValueOnce({ select: existingSelect })
    .mockReturnValueOnce({ lean: engagementLean })
  mockUserBulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
  mockClassFindOne.mockResolvedValue(null)
  mockClassCreate.mockResolvedValue({ _id: 'class-db-id' })
  const res = response()

  const pending = syncHotmartUsers({} as Request, res as unknown as Response)
  await jest.advanceTimersByTimeAsync(1_000)
  await pending

  expect(mockUserBulkWrite).toHaveBeenCalledWith([
    expect.objectContaining({ updateOne: expect.objectContaining({
      filter: { email: 'student@example.test' },
      upsert: true
    }) })
  ], { ordered: false })
  expect(mockClassCreate).toHaveBeenCalledWith(expect.objectContaining({ classId: 'class-1' }))
  expect(mockClearCache).toHaveBeenCalledTimes(1)
  expect(mockBuildStats).toHaveBeenCalledTimes(1)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({
    message: 'Sincronização Hotmart concluída com pré-cálculo de engagement!',
    stats: {
      total: 1, added: 1, updated: 0, withProgress: 1, withEngagement: 0,
      withClasses: 1, newClassesCreated: 1, uniqueClasses: 1,
      classIds: ['class-1'], errors: 0
    }
  })
})
