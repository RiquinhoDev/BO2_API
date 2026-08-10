import express from 'express'
import request from 'supertest'

const mockFindById = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindById },
}))

import { createErrorHandling } from '../../src/security/errorHandling'
import { getStudentStats } from '../../src/services/users/studentStats.runtime'

const LOOPBACK = '?__bo2_offline_loopback=1'
const NOW = new Date('2026-08-05T00:00:00.000Z')

function studentStatsApp(): express.Express {
  const app = express()
  // Mirrors the real pipeline: correlation id in front, central boundary last.
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'test-correlation-id',
    logError: () => undefined,
  })
  app.use(errorHandling.correlationId)
  app.get('/users/:id/stats', getStudentStats)
  app.get('/users/student/:id/stats', getStudentStats)
  app.use(errorHandling.handler)
  return app
}

beforeEach(() => {
  mockFindById.mockReset()
  jest.useFakeTimers().setSystemTime(NOW)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('getStudentStats — characterization of the legacy contract', () => {
  test('returns the full stats envelope with canonical field precedence', async () => {
    mockFindById.mockResolvedValue({
      _id: 'student-1',
      email: 'student@example.test',
      name: 'Student',
      classId: 'legacy-class',
      discord: { discordIds: ['12345678901234567', '123456789012345678'] },
      hotmart: {
        purchaseDate: new Date('2026-07-06T00:00:00.000Z'),
        lastAccessDate: new Date('2026-01-01T00:00:00.000Z'),
      },
      curseduca: { lastAccess: new Date('2026-01-01T00:00:00.000Z') },
      combined: {
        status: 'ACTIVE',
        totalProgress: 75,
        classId: 'canonical-class',
        lastActivity: new Date('2026-08-01T00:00:00.000Z'),
      },
    })

    const response = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)

    // Exact key set: the façade split must not add or drop a field.
    expect(Object.keys(response.body).sort()).toEqual([
      'classId',
      'daysSinceLastAccess',
      'daysSincePurchase',
      'hasClass',
      'hasDiscordIds',
      'hasEmail',
      'hasLastAccess',
      'hasName',
      'hasProgress',
      'hasPurchaseDate',
      'isActive',
      'progressPercentage',
      'totalDiscordIds',
      'validationStatus',
    ])

    expect(response.body).toEqual({
      hasEmail: true,
      hasName: true,
      hasDiscordIds: true,
      totalDiscordIds: 2,
      isActive: true,
      hasProgress: true,
      progressPercentage: 75,
      hasPurchaseDate: true,
      hasLastAccess: true,
      // 2026-07-06 -> 2026-08-05 is exactly 30 days.
      daysSincePurchase: 30,
      // combined.lastActivity wins over hotmart.lastAccessDate and curseduca.lastAccess.
      daysSinceLastAccess: 4,
      hasClass: true,
      // combined.classId wins over the legacy top-level classId.
      classId: 'canonical-class',
      validationStatus: { email: true, discordIds: true, name: true },
    })
  })

  test('falls back through hotmart then curseduca for the last access date', async () => {
    mockFindById.mockResolvedValue({
      email: 'student@example.test',
      name: 'Student',
      hotmart: { lastAccessDate: new Date('2026-08-03T00:00:00.000Z') },
      curseduca: { lastAccess: new Date('2026-01-01T00:00:00.000Z') },
      combined: {},
    })

    const hotmartWins = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)
    expect(hotmartWins.body.daysSinceLastAccess).toBe(2)

    mockFindById.mockResolvedValue({
      email: 'student@example.test',
      name: 'Student',
      curseduca: { lastAccess: new Date('2026-08-04T00:00:00.000Z') },
      combined: {},
    })

    const curseducaWins = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)
    expect(curseducaWins.body.daysSinceLastAccess).toBe(1)
  })

  test('reports absent optional data as null and false, never as zero', async () => {
    mockFindById.mockResolvedValue({ combined: {} })

    const response = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)

    expect(response.body).toEqual({
      hasEmail: false,
      hasName: false,
      hasDiscordIds: false,
      totalDiscordIds: 0,
      isActive: false,
      hasProgress: false,
      progressPercentage: 0,
      hasPurchaseDate: false,
      hasLastAccess: false,
      daysSincePurchase: null,
      daysSinceLastAccess: null,
      hasClass: false,
      classId: undefined,
      // An empty discordIds array satisfies `.every()` vacuously — this is the
      // current behaviour and must survive the extraction unchanged.
      validationStatus: { email: false, discordIds: true, name: false },
    })
  })

  test('validates email shape, Discord snowflake length and blank names', async () => {
    mockFindById.mockResolvedValue({
      email: 'not-an-email',
      name: '   ',
      discord: { discordIds: ['123'] },
      combined: {},
    })

    const response = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)

    expect(response.body.validationStatus).toEqual({
      email: false,
      // 3 digits is outside the accepted 17-19 range.
      discordIds: false,
      name: false,
    })
    // A blank name is still "present" for hasName, but invalid for validationStatus.
    expect(response.body.hasName).toBe(true)
  })

  test('treats a non-ACTIVE combined status as inactive', async () => {
    mockFindById.mockResolvedValue({ combined: { status: 'INACTIVE' } })

    const response = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)

    expect(response.body.isActive).toBe(false)
  })

  test('returns 404 with the legacy message when the student is missing', async () => {
    mockFindById.mockResolvedValue(null)

    const response = await request(studentStatsApp())
      .get(`/users/missing/stats${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({ message: 'Aluno não encontrado.' })
  })

  test('serves the /student/:id/stats alias with the identical contract', async () => {
    mockFindById.mockResolvedValue({ email: 'a@b.test', name: 'A', combined: {} })

    const canonical = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(200)
    const alias = await request(studentStatsApp())
      .get(`/users/student/student-1/stats${LOOPBACK}`)
      .expect(200)

    expect(alias.body).toEqual(canonical.body)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // DELIBERATE CHANGE (SEC-10). The legacy handler answered 500 with
  // `{ message, details: <raw error message> }`, leaking internal detail.
  // The extracted controller forwards an HttpError to the central boundary,
  // so the public body is now the redacted correlation-aware envelope.
  // The 200 and 404 contracts above are unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  test('routes failures through the central boundary without leaking detail', async () => {
    mockFindById.mockRejectedValue(new Error('mongo exploded'))

    const response = await request(studentStatsApp())
      .get(`/users/student-1/stats${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'STUDENT_STATS_FAILED',
      message: 'Erro ao calcular estatísticas do aluno.',
      correlationId: 'test-correlation-id',
    })
    expect(response.headers['x-request-id']).toBe('test-correlation-id')
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})
