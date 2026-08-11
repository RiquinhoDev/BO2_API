import type { Request, Response } from 'express'

jest.mock('../../src/models', () => ({
  SyncHistory: { find: jest.fn() },
  User: { findOne: jest.fn() }
}))

jest.mock('../../src/models/SyncModels/SyncReport', () => ({
  __esModule: true,
  default: { find: jest.fn() }
}))

import { SyncHistory, User } from '../../src/models'
import SyncReport from '../../src/models/SyncModels/SyncReport'
import {
  compareSyncMethods,
  findHotmartUser
} from '../../src/controllers/hotmart/hotmartDiagnostics.controller'

function responseHarness(): { response: Response; status: jest.Mock; json: jest.Mock } {
  const status = jest.fn().mockReturnThis()
  const json = jest.fn()
  return { response: { status, json } as unknown as Response, status, json }
}

function queryChain<T>(result: T) {
  const lean = jest.fn().mockResolvedValue(result)
  const select = jest.fn().mockReturnValue({ lean })
  const limit = jest.fn().mockReturnValue({ select })
  const sort = jest.fn().mockReturnValue({ limit })
  return { sort, limit, select, lean }
}

describe('Hotmart diagnostics controller', () => {
  beforeEach(() => jest.clearAllMocks())

  test('requires an email before querying the user', async () => {
    const { response, status, json } = responseHarness()

    await findHotmartUser({ query: {} } as Request, response, jest.fn())

    expect(User.findOne).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ message: 'Email é obrigatório' })
  })

  test('returns the exact compatibility envelope for a matching user', async () => {
    const id = { toString: () => 'user-id' }
    jest.mocked(User.findOne).mockResolvedValue({
      _id: id,
      email: 'student@example.test',
      name: 'Student',
      hotmart: { hotmartUserId: 'hotmart-id' },
      combined: { status: 'ACTIVE', totalProgress: 75 }
    })
    const { response, status, json } = responseHarness()

    await findHotmartUser(
      { query: { email: 'student@example.test' } } as unknown as Request,
      response, jest.fn()
    )

    expect(User.findOne).toHaveBeenCalledWith({ email: 'student@example.test' })
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        id,
        email: 'student@example.test',
        name: 'Student',
        hotmartUserId: 'hotmart-id',
        status: 'ACTIVE',
        progress: 75
      },
      meta: { message: 'Utilizador encontrado' }
    })
  })

  test('returns not found without changing the compatibility contract', async () => {
    jest.mocked(User.findOne).mockResolvedValue(null)
    const { response, status, json } = responseHarness()

    await findHotmartUser(
      { query: { email: 'missing@example.test' } } as unknown as Request,
      response, jest.fn()
    )

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ message: 'Utilizador não encontrado' })
  })

  test('compares the five latest legacy and universal executions', async () => {
    const legacy = [
      { startedAt: new Date('2026-01-01T00:00:00Z'), completedAt: new Date('2026-01-01T00:00:10Z') },
      { startedAt: new Date('2026-01-02T00:00:00Z') }
    ]
    const universal = [{ duration: 6 }, { duration: 4 }]
    const legacyQuery = queryChain(legacy)
    const universalQuery = queryChain(universal)
    jest.mocked(SyncHistory.find).mockReturnValue(
      legacyQuery as unknown as ReturnType<typeof SyncHistory.find>
    )
    jest.mocked(SyncReport.find).mockReturnValue(
      universalQuery as unknown as ReturnType<typeof SyncReport.find>
    )
    const { response, json } = responseHarness()

    await compareSyncMethods({} as Request, response, jest.fn())

    expect(SyncHistory.find).toHaveBeenCalledWith({ type: 'hotmart' })
    expect(legacyQuery.sort).toHaveBeenCalledWith({ startedAt: -1 })
    expect(legacyQuery.limit).toHaveBeenCalledWith(5)
    expect(legacyQuery.select).toHaveBeenCalledWith('startedAt completedAt status stats')
    expect(SyncReport.find).toHaveBeenCalledWith({ syncType: 'hotmart' })
    expect(universalQuery.sort).toHaveBeenCalledWith({ startedAt: -1 })
    expect(universalQuery.limit).toHaveBeenCalledWith(5)
    expect(universalQuery.select).toHaveBeenCalledWith('startedAt completedAt status stats duration')
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        legacy: { count: 2, latest: legacy[0], all: legacy },
        universal: { count: 2, latest: universal[0], all: universal },
        comparison: { avgDurationLegacy: 5, avgDurationUniversal: 5 }
      }
    })
  })
})
