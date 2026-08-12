import type { Request, Response } from 'express'

jest.mock('../../src/models', () => ({ User: { find: jest.fn() } }))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: {
    fetchHotmartDataForSync: jest.fn(),
    fetchProgressForExistingUsers: jest.fn()
  }
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: jest.fn() }
}))

import { User } from '../../src/models'
import hotmartAdapter from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import universalSyncService from '../../src/services/syncUtilizadoresServices/universalSync'
import {
  syncHotmartUsersUniversal,
  syncProgressOnlyUniversal
} from '../../src/controllers/hotmart/hotmartUniversalSync.controller'

function responseHarness(): { response: Response; status: jest.Mock; json: jest.Mock } {
  const status = jest.fn().mockReturnThis()
  const json = jest.fn()
  return { response: { status, json } as unknown as Response, status, json }
}

const syncResult = {
  success: true,
  reportId: 'report-id',
  syncHistoryId: 'history-id',
  stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, unchanged: 0 },
  duration: 1,
  errors: [],
  warnings: []
}

describe('Hotmart Universal Sync controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(universalSyncService.executeUniversalSync).mockResolvedValue(syncResult)
  })

  test('forwards the authenticated principal and callbacks to full sync', async () => {
    const sourceData = [{ email: 'student@example.test', name: 'Student', hotmartUserId: 'hotmart-id' }]
    jest.mocked(hotmartAdapter.fetchHotmartDataForSync).mockResolvedValue(sourceData)
    const { response, status, json } = responseHarness()

    await syncHotmartUsersUniversal({ user: { id: 'admin-id' } } as Request, response, jest.fn())

    expect(hotmartAdapter.fetchHotmartDataForSync).toHaveBeenCalledWith({
      includeProgress: true,
      includeLessons: true,
      progressConcurrency: 5
    })
    expect(universalSyncService.executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
      syncType: 'hotmart',
      triggeredBy: 'MANUAL',
      triggeredByUser: 'admin-id',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData,
      onProgress: expect.any(Function),
      onError: expect.any(Function),
      onWarning: expect.any(Function)
    }))
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ completed: true }),
      meta: { message: expect.any(String) },
    })
  })

  test('does not execute full sync when the adapter returns no users', async () => {
    jest.mocked(hotmartAdapter.fetchHotmartDataForSync).mockResolvedValue([])
    const { response, status, json } = responseHarness()

    await syncHotmartUsersUniversal({} as Request, response, jest.fn())

    expect(universalSyncService.executeUniversalSync).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: { completed: false, stats: { total: 0, inserted: 0, updated: 0, errors: 0 } },
      meta: { message: 'Nenhum utilizador encontrado na Hotmart' },
    })
  })

  test('maps existing users and progress into a progress-only sync', async () => {
    const users = [
      { email: 'one@example.test', name: 'One', hotmart: { hotmartUserId: 'one' } },
      { email: 'two@example.test', name: 'Two', hotmart: { hotmartUserId: 'two' } }
    ]
    const lean = jest.fn().mockResolvedValue(users)
    const select = jest.fn().mockReturnValue({ lean })
    jest.mocked(User.find).mockReturnValue({ select } as unknown as ReturnType<typeof User.find>)
    const progress = {
      completedPercentage: 42,
      total: 10,
      completed: 4,
      lessons: [],
      lastUpdated: new Date('2026-01-01T00:00:00Z')
    }
    jest.mocked(hotmartAdapter.fetchProgressForExistingUsers).mockResolvedValue(
      new Map([['one', progress]])
    )
    const { response, status, json } = responseHarness()

    await syncProgressOnlyUniversal({ user: { id: 'admin-id' } } as Request, response, jest.fn())

    expect(User.find).toHaveBeenCalledWith({
      'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }
    })
    expect(select).toHaveBeenCalledWith('hotmart.hotmartUserId email name')
    expect(hotmartAdapter.fetchProgressForExistingUsers).toHaveBeenCalledWith(['one', 'two'])
    expect(universalSyncService.executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
      triggeredByUser: 'admin-id',
      fullSync: false,
      batchSize: 100,
      sourceData: [
        { email: 'one@example.test', name: 'One', hotmartUserId: 'one', progress },
        { email: 'two@example.test', name: 'Two', hotmartUserId: 'two', progress: undefined }
      ]
    }))
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ completed: true, withProgress: 1 }),
      meta: { message: 'Progresso sincronizado via Universal Service!' },
    })
  })

  test('does not fetch progress or execute sync when no users have a Hotmart id', async () => {
    const lean = jest.fn().mockResolvedValue([])
    const select = jest.fn().mockReturnValue({ lean })
    jest.mocked(User.find).mockReturnValue({ select } as unknown as ReturnType<typeof User.find>)
    const { response, status, json } = responseHarness()

    await syncProgressOnlyUniversal({} as Request, response, jest.fn())

    expect(hotmartAdapter.fetchProgressForExistingUsers).not.toHaveBeenCalled()
    expect(universalSyncService.executeUniversalSync).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: { completed: true, stats: { total: 0 } },
      meta: { message: 'Nenhum utilizador com Hotmart ID encontrado' },
    })
  })
})
