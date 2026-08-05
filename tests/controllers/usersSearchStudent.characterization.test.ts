import express from 'express'
import request from 'supertest'

const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind },
}))

jest.mock('../../src/models', () => ({
  __esModule: true,
  UserProduct: { find: mockUserProductFind },
}))

import { createErrorHandling } from '../../src/security/errorHandling'
import { searchStudent } from '../../src/services/users/studentSearch.runtime'

const LOOPBACK = '__bo2_offline_loopback=1'

type Chain = {
  select: jest.Mock
  populate: jest.Mock
  lean: jest.Mock
  limit: jest.Mock
}

function chain<T>(rows: T[]): Chain {
  const query: Chain = {
    select: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(rows),
    limit: jest.fn(),
  }
  query.select.mockReturnValue(query)
  query.populate.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  return query
}

function app(): express.Express {
  const instance = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'test-correlation-id',
    logError: () => undefined,
  })
  instance.use(errorHandling.correlationId)
  instance.get('/users/search', searchStudent)
  instance.use(errorHandling.handler)
  return instance
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-1',
    email: 'student@example.test',
    name: 'Student One',
    ...overrides,
  }
}

beforeEach(() => {
  mockUserFind.mockReset()
  mockUserProductFind.mockReset()
  mockUserProductFind.mockReturnValue(chain([]))
})

describe('searchStudent — request validation', () => {
  test('returns 400 listing every accepted criterion when none is supplied', async () => {
    const response = await request(app())
      .get(`/users/search?${LOOPBACK}`)
      .expect(400)

    expect(response.body).toEqual({
      message:
        'Pelo menos um critério de pesquisa é necessário (email, name, discordId, hotmartUserId, ou curseducaUserId).',
    })
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('returns 404 with the legacy message when nothing matches', async () => {
    mockUserFind.mockReturnValue(chain([]))

    const response = await request(app())
      .get(`/users/search?email=missing@example.test&${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({
      message: 'Nenhum aluno encontrado com os critérios fornecidos.',
    })
    expect(mockUserProductFind).not.toHaveBeenCalled()
  })
})

describe('searchStudent — query construction', () => {
  test('builds case-insensitive regexes for email and name', async () => {
    mockUserFind.mockReturnValue(chain([]))

    await request(app())
      .get(`/users/search?email=someone&name=Someone&${LOOPBACK}`)
      .expect(404)

    const filter = mockUserFind.mock.calls[0][0]
    expect(filter.email.$regex).toBeInstanceOf(RegExp)
    expect(filter.email.$regex.source).toBe('someone')
    expect(filter.email.$regex.flags).toBe('i')
    expect(filter.name.$regex.source).toBe('Someone')
    expect(filter.$or).toBeUndefined()
  })

  test('matches platform ids against both the segregated and legacy paths', async () => {
    mockUserFind.mockReturnValue(chain([]))

    await request(app())
      .get(`/users/search?discordId=111&hotmartUserId=222&curseducaUserId=333&${LOOPBACK}`)
      .expect(404)

    expect(mockUserFind.mock.calls[0][0].$or).toEqual([
      { 'discord.discordIds': { $in: ['111'] } },
      { discordIds: { $in: ['111'] } },
      { 'hotmart.hotmartUserId': '222' },
      { hotmartUserId: '222' },
      { 'curseduca.curseducaUserId': '333' },
      { curseducaUserId: '333' },
    ])
  })

  // ─────────────────────────────────────────────────────────────────────────
  // These two pinned the pre-hardening behaviour and were changed on purpose
  // by the security slice. Full coverage of the new rules lives in
  // tests/security/usersSearchHardening.test.ts.
  // ─────────────────────────────────────────────────────────────────────────
  test('matches metacharacters literally instead of interpreting them', async () => {
    mockUserFind.mockReturnValue(chain([]))

    await request(app())
      .get(`/users/search?email=${encodeURIComponent('a.b@x.com')}&${LOOPBACK}`)
      .expect(404)

    const pattern: RegExp = mockUserFind.mock.calls[0][0].email.$regex
    // The dot used to be a wildcard; it now only matches a dot.
    expect(pattern.test('aXb@x.com')).toBe(false)
    expect(pattern.test('a.b@x.com')).toBe(true)
  })

  test('bounds the student query instead of scanning without a cap', async () => {
    const query = chain([])
    mockUserFind.mockReturnValue(query)

    await request(app())
      .get(`/users/search?name=a&${LOOPBACK}`)
      .expect(404)

    expect(query.limit).toHaveBeenCalledWith(201)
    expect(query.select).toHaveBeenCalledTimes(1)
  })
})

describe('searchStudent — single and multiple results', () => {
  test('returns the transformed student directly when exactly one matches', async () => {
    mockUserFind.mockReturnValue(chain([student()]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    // Not wrapped: the single-result body IS the student object.
    expect(response.body._id).toBe('user-1')
    expect(response.body.multiple).toBeUndefined()
    expect(response.body.students).toBeUndefined()
  })

  test('wraps several matches in the multiple envelope', async () => {
    mockUserFind.mockReturnValue(
      chain([student(), student({ _id: 'user-2', email: 'other@example.test' })]),
    )

    const response = await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(response.body.multiple).toBe(true)
    expect(response.body.message).toBe('Encontrados 2 alunos')
    expect(response.body.students).toHaveLength(2)
    expect(response.body.students[0]._id).toBe('user-1')
  })

  test('queries the products of every matched user in one call', async () => {
    mockUserFind.mockReturnValue(chain([student(), student({ _id: 'user-2' })]))
    const productQuery = chain([])
    mockUserProductFind.mockReturnValue(productQuery)

    await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(mockUserProductFind).toHaveBeenCalledTimes(1)
    expect(mockUserProductFind).toHaveBeenCalledWith({
      userId: { $in: ['user-1', 'user-2'] },
    })
    expect(productQuery.populate).toHaveBeenCalledWith('productId', 'code name')
  })
})

describe('searchStudent — legacy field transformation', () => {
  test('remaps segregated fields onto the flat legacy shape with defaults', async () => {
    mockUserFind.mockReturnValue(chain([
      student({
        discord: { discordIds: ['123'], role: 'ADMIN', acceptedTerms: true },
        hotmart: { hotmartUserId: 'h-1', lastAccessDate: '2026-07-01' },
        curseduca: { curseducaUserId: 'c-1' },
        combined: {
          status: 'ACTIVE',
          totalProgress: 50,
          totalLessons: 10,
          engagement: { level: 'HIGH', score: 88 },
          classId: 'class-1',
          className: 'Turma 1',
        },
      }),
    ]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    expect(response.body).toMatchObject({
      discordIds: ['123'],
      status: 'ACTIVE',
      role: 'ADMIN',
      acceptedTerms: true,
      isDeletable: true,
      priority: 'MEDIUM',
      locale: 'pt_BR',
      hotmartUserId: 'h-1',
      curseducaUserId: 'c-1',
      engagement: 'HIGH',
      engagementScore: 88,
      classId: 'class-1',
      className: 'Turma 1',
      estado: 'ativo',
      timer: 0,
      isDeleted: false,
      accessCount: 0,
      // completed = round(totalProgress / 100 * totalLessons)
      progress: { completedPercentage: 50, total: 10, completed: 5 },
    })
  })

  test('marks a deleted Discord identity as INACTIVE even when combined says ACTIVE', async () => {
    mockUserFind.mockReturnValue(chain([
      student({
        discord: { isDeleted: true },
        combined: { status: 'ACTIVE' },
      }),
    ]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    expect(response.body.status).toBe('INACTIVE')
    expect(response.body.isDeleted).toBe(true)
    // `estado` reads combined.status only, so it disagrees with `status` here.
    expect(response.body.estado).toBe('ativo')
  })

  test('falls back through the access-date chain', async () => {
    mockUserFind.mockReturnValue(chain([
      student({ curseduca: { lastLogin: '2026-06-01' } }),
    ]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    expect(response.body.lastAccessDate).toBe('2026-06-01')
    // No `combined` means no progress block at all.
    expect(response.body.progress).toBeUndefined()
  })

  test('adds each product as a virtual class and indexes its ActiveCampaign tags', async () => {
    mockUserFind.mockReturnValue(chain([
      student({ combined: { status: 'ACTIVE', allClasses: [] } }),
    ]))
    mockUserProductFind.mockReturnValue(chain([
      {
        userId: 'user-1',
        productId: { code: 'CLAREZA', name: 'Clareza' },
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: '2026-01-01',
        activeCampaignData: { tags: ['tag-a'], lastSyncAt: '2026-02-01' },
      },
    ]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    expect(response.body.combined.allClasses).toEqual([
      {
        classId: 'CLAREZA',
        className: 'Clareza',
        source: 'hotmart',
        isActive: true,
        enrolledAt: '2026-01-01',
        role: 'student',
      },
    ])
    expect(response.body.acTagsByProduct).toEqual({
      CLAREZA: {
        productCode: 'CLAREZA',
        productName: 'Clareza',
        tags: ['tag-a'],
        lastSyncAt: '2026-02-01',
      },
    })
  })

  test('does not duplicate a product that already exists as a class', async () => {
    mockUserFind.mockReturnValue(chain([
      student({
        combined: {
          allClasses: [{ classId: 'CLAREZA', className: 'Clareza', isActive: true }],
        },
      }),
    ]))
    mockUserProductFind.mockReturnValue(chain([
      {
        userId: 'user-1',
        productId: { code: 'CLAREZA', name: 'Clareza' },
        platform: 'hotmart',
        status: 'ACTIVE',
      },
    ]))

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(200)

    expect(response.body.combined.allClasses).toHaveLength(1)
  })
})

describe('searchStudent — failure contract', () => {
  // DELIBERATE CHANGE (SEC-10): the legacy body carried `details` with the raw
  // error message; failures now reach the central boundary redacted.
  test('routes failures through the central boundary without leaking detail', async () => {
    mockUserFind.mockImplementation(() => {
      throw new Error('mongo exploded')
    })

    const response = await request(app())
      .get(`/users/search?email=student@example.test&${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'STUDENT_SEARCH_FAILED',
      message: 'Erro ao buscar aluno.',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })

  // DELIBERATE CHANGE: a bare bracket used to throw while the filter was built
  // and surfaced as a 500. It is now an ordinary literal search.
  test('an invalid regex term is a normal search, no longer a server error', async () => {
    mockUserFind.mockReturnValue(chain([]))

    const response = await request(app())
      .get(`/users/search?email=${encodeURIComponent('[')}&${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({
      message: 'Nenhum aluno encontrado com os critérios fornecidos.',
    })
    expect(mockUserFind).toHaveBeenCalledTimes(1)
  })
})
