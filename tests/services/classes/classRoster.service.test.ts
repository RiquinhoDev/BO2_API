import {
  ClassRosterService,
  escapeRegex,
  sanitizeLimit,
  sanitizeOffset,
  sanitizeSortBy,
  type ClassRosterReader,
  type RosterUser,
} from '../../../src/services/classes/classRoster.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock = { now: () => FIXED }

const makeReader = (overrides: Partial<ClassRosterReader> = {}): ClassRosterReader => ({
  getClassById: jest.fn(async () => ({ name: 'Turma X', source: 'hotmart' })),
  findCurseducaMemberIds: jest.fn(async () => []),
  findStudents: jest.fn(async () => [{ _id: 'u1', name: 'Ana', metadata: { createdAt: FIXED } } as RosterUser]),
  countStudents: jest.fn(async () => 1),
  searchStudents: jest.fn(async () => [
    { _id: 'u1', name: 'Ana', classId: 'C1' } as RosterUser,
    { _id: 'u2', name: 'Bea', classId: 'C1' } as RosterUser,
  ]),
  countSearch: jest.fn(async () => 2),
  resolveClassNames: jest.fn(async () => new Map([['C1', 'Turma C1']])),
  ...overrides,
})

describe('classRoster sanitizers', () => {
  it('caps and validates the limit', () => {
    expect(sanitizeLimit(500, 100)).toBe(200)
    expect(sanitizeLimit(50, 100)).toBe(50)
    expect(sanitizeLimit(Number.NaN, 100)).toBe(100)
    expect(sanitizeLimit(-3, 100)).toBe(100)
    expect(sanitizeLimit(1000, 1000)).toBe(200)
  })

  it('validates the offset', () => {
    expect(sanitizeOffset(20)).toBe(20)
    expect(sanitizeOffset(-1)).toBe(0)
    expect(sanitizeOffset(Number.NaN)).toBe(0)
  })

  it('restricts sortBy to an allowlist', () => {
    expect(sanitizeSortBy('name')).toBe('name')
    expect(sanitizeSortBy('email')).toBe('email')
    expect(sanitizeSortBy('$where')).toBe('name')
    expect(sanitizeSortBy('anything')).toBe('name')
  })

  it('escapes regex metacharacters literally', () => {
    expect(escapeRegex('a.b+c')).toBe('a\\.b\\+c')
  })
})

describe('ClassRosterService', () => {
  it('stamps the injected clock exactly on the roster and the search', async () => {
    const service = new ClassRosterService(makeReader(), fixedClock)
    const roster = await service.getStudents('C1', { includeInactive: false, limit: 100, offset: 0, sortBy: 'name', sortOrder: 'asc' })
    expect(roster.kind).toBe('ok')
    if (roster.kind === 'ok') expect(roster.timestamp).toBe('2026-01-02T03:04:05.000Z')

    const search = await service.search({ email: 'ana@b.test', limit: 50, offset: 0 })
    expect(search.kind).toBe('ok')
    if (search.kind === 'ok') expect(search.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('sorts the roster with an _id tiebreak', async () => {
    const findStudents = jest.fn(async () => [] as RosterUser[])
    const service = new ClassRosterService(makeReader({ findStudents }), fixedClock)
    await service.getStudents('C1', { includeInactive: false, limit: 100, offset: 0, sortBy: 'name', sortOrder: 'desc' })
    expect(findStudents).toHaveBeenCalledWith(expect.anything(), { name: -1, _id: 1 }, 100, 0)
  })

  it('resolves class names in a single batch read, not per student (no N+1)', async () => {
    const resolveClassNames = jest.fn(async () => new Map([['C1', 'Turma C1']]))
    const service = new ClassRosterService(makeReader({ resolveClassNames }), fixedClock)
    const result = await service.search({ classId: 'C1', limit: 50, offset: 0 })
    expect(result.kind).toBe('ok')
    // Two students share one classId -> one batch call with the distinct id.
    expect(resolveClassNames).toHaveBeenCalledTimes(1)
    expect(resolveClassNames).toHaveBeenCalledWith(['C1'])
  })
})
