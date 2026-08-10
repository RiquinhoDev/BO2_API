import express from 'express'
import request from 'supertest'

const mockFindById = jest.fn()
const mockUserHistoryFind = jest.fn()
const mockClassHistoryFind = jest.fn()
const mockSyncHistoryFind = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindById },
}))
jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: { find: mockUserHistoryFind },
}))
jest.mock('../../src/models/StudentClassHistory', () => ({
  __esModule: true,
  default: { find: mockClassHistoryFind },
}))
jest.mock('../../src/models/SyncHistory', () => ({
  __esModule: true,
  default: { find: mockSyncHistoryFind },
}))

import { createErrorHandling } from '../../src/security/errorHandling'
import { getStudentHistory } from '../../src/services/users/studentHistory.runtime'

const LOOPBACK = '__bo2_offline_loopback=1'
const VALID_ID = '507f1f77bcf86cd799439011'

function chain<T>(rows: T[]) {
  const query = {
    sort: jest.fn(),
    limit: jest.fn(),
    populate: jest.fn(),
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(rows),
  }
  query.sort.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.populate.mockReturnValue(query)
  query.select.mockReturnValue(query)
  return query
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    _id: VALID_ID,
    email: 'student@example.test',
    name: 'Student',
    discord: { discordIds: [] },
    get: jest.fn().mockReturnValue(undefined),
    ...overrides,
  }
}

function app(): express.Express {
  const instance = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'test-correlation-id',
    logError: () => undefined,
  })
  instance.use(errorHandling.correlationId)
  instance.get('/users/:id/history', getStudentHistory)
  instance.use(errorHandling.handler)
  return instance
}

beforeEach(() => {
  mockFindById.mockReset()
  mockUserHistoryFind.mockReset()
  mockClassHistoryFind.mockReset()
  mockSyncHistoryFind.mockReset()
  mockUserHistoryFind.mockReturnValue(chain([]))
  mockClassHistoryFind.mockReturnValue(chain([]))
  mockSyncHistoryFind.mockReturnValue(chain([]))
})

describe('getStudentHistory — characterization', () => {
  test('merges the three sources, sorts by date descending and tags each type', async () => {
    mockFindById.mockResolvedValue(student())
    mockUserHistoryFind.mockReturnValue(
      chain([{ changeDate: new Date('2026-03-01T00:00:00.000Z'), source: 'SYNC' }]),
    )
    mockClassHistoryFind.mockReturnValue(
      chain([{ dateMoved: new Date('2026-05-01T00:00:00.000Z') }]),
    )
    mockSyncHistoryFind.mockReturnValue(
      chain([{ startedAt: new Date('2026-04-01T00:00:00.000Z'), type: 'HOTMART' }]),
    )

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)

    expect(response.body.history.map((item: { type: string }) => item.type)).toEqual([
      'class_change',
      'sync',
      'user_change',
    ])
    // Each source maps its own date field onto the shared `date` key.
    expect(response.body.history.map((item: { date: string }) => item.date)).toEqual([
      '2026-05-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ])
    // `source` is preserved for user changes, forced to MANUAL for class changes
    // and overwritten with the sync type for sync events.
    expect(response.body.history.map((item: { source: string }) => item.source)).toEqual([
      'MANUAL',
      'HOTMART',
      'SYNC',
    ])
  })

  test('exposes the full legacy envelope including the per-source duplicates', async () => {
    mockFindById.mockResolvedValue(student())
    const userRows = [{ changeDate: new Date('2026-03-01T00:00:00.000Z') }]
    mockUserHistoryFind.mockReturnValue(chain(userRows))

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)

    expect(Object.keys(response.body).sort()).toEqual([
      'classHistory',
      'history',
      'stats',
      'student',
      'syncHistory',
      'total',
      'userHistory',
    ])
    expect(response.body.stats).toEqual({
      totalItems: 1,
      userChanges: 1,
      classChanges: 0,
      syncEvents: 0,
      lastActivity: '2026-03-01T00:00:00.000Z',
    })
    expect(response.body.total).toBe(1)
    // The raw per-source arrays are duplicated alongside the merged history.
    expect(response.body.userHistory).toHaveLength(1)
  })

  test('reports a null lastActivity when no source returned anything', async () => {
    mockFindById.mockResolvedValue(student())

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)

    expect(response.body.stats).toEqual({
      totalItems: 0,
      userChanges: 0,
      classChanges: 0,
      syncEvents: 0,
      lastActivity: null,
    })
  })

  test('honours the limit query parameter and defaults to 50', async () => {
    mockFindById.mockResolvedValue(student())
    const userQuery = chain([])
    mockUserHistoryFind.mockReturnValue(userQuery)

    await request(app())
      .get(`/users/${VALID_ID}/history?limit=5&${LOOPBACK}`)
      .expect(200)
    expect(userQuery.limit).toHaveBeenCalledWith(5)

    const defaultQuery = chain([])
    mockUserHistoryFind.mockReturnValue(defaultQuery)
    await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)
    expect(defaultQuery.limit).toHaveBeenCalledWith(50)

    // The class history limit is a hard-coded 20, independent of the query.
    expect(mockClassHistoryFind.mock.results[0].value.limit).toHaveBeenCalledWith(20)
    // The sync history limit is a hard-coded 10.
    expect(mockSyncHistoryFind.mock.results[0].value.limit).toHaveBeenCalledWith(10)
  })

  test('truncates the merged history to the requested limit', async () => {
    mockFindById.mockResolvedValue(student())
    mockUserHistoryFind.mockReturnValue(
      chain([
        { changeDate: new Date('2026-03-03T00:00:00.000Z') },
        { changeDate: new Date('2026-03-02T00:00:00.000Z') },
        { changeDate: new Date('2026-03-01T00:00:00.000Z') },
      ]),
    )

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?limit=2&${LOOPBACK}`)
      .expect(200)

    expect(response.body.history).toHaveLength(2)
    // stats.totalItems counts the truncated list, not the raw source rows.
    expect(response.body.stats.totalItems).toBe(2)
    expect(response.body.stats.userChanges).toBe(3)
  })

  test('degrades to an empty source when one history query fails, still returning 200', async () => {
    mockFindById.mockResolvedValue(student())
    const failing = chain<never>([])
    failing.lean.mockRejectedValue(new Error('user history unavailable'))
    mockUserHistoryFind.mockReturnValue(failing)
    mockClassHistoryFind.mockReturnValue(
      chain([{ dateMoved: new Date('2026-05-01T00:00:00.000Z') }]),
    )

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)

    // Per-source try/catch: a failed source is silently empty, the rest survives.
    expect(response.body.userHistory).toEqual([])
    expect(response.body.stats.userChanges).toBe(0)
    expect(response.body.stats.classChanges).toBe(1)
  })

  test('silently degrades when the id is not a valid ObjectId', async () => {
    mockFindById.mockResolvedValue(student())

    const response = await request(app())
      .get(`/users/not-an-object-id/history?${LOOPBACK}`)
      .expect(200)

    // `new mongoose.Types.ObjectId(id)` throws inside the inner try, so the user
    // history source is dropped without any 400 or 500 reaching the client.
    expect(response.body.userHistory).toEqual([])
    expect(response.body.stats.userChanges).toBe(0)
  })

  test('derives platform flags from canonical fields and legacy fallbacks', async () => {
    const legacy = student({
      discord: {},
      get: jest.fn((field: string) => {
        if (field === 'discordIds') return ['123']
        if (field === 'hotmartUserId') return 'legacy-hotmart'
        return undefined
      }),
    })
    mockFindById.mockResolvedValue(legacy)

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(200)

    expect(response.body.student.platforms).toEqual({
      discord: true,
      hotmart: true,
      curseduca: false,
    })
  })

  test('returns 404 with the legacy message when the student is missing', async () => {
    mockFindById.mockResolvedValue(null)

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({ message: 'Aluno não encontrado.' })
    expect(mockUserHistoryFind).not.toHaveBeenCalled()
  })

  // DELIBERATE CHANGE (SEC-10): the legacy 500 body carried `details` with the
  // raw error message. A failure of the *student* lookup — the one read that is
  // not degraded — now reaches the central boundary.
  test('routes a student lookup failure through the central boundary', async () => {
    mockFindById.mockRejectedValue(new Error('mongo exploded'))

    const response = await request(app())
      .get(`/users/${VALID_ID}/history?${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'STUDENT_HISTORY_FAILED',
      message: 'Erro ao buscar histórico do aluno.',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})
