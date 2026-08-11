import { Types } from 'mongoose'
import {
  ClassRosterService,
  escapeRegex,
  resolveSortPath,
  sanitizeLimit,
  sanitizeOffset,
  sanitizeSortBy,
  type ClassRosterReader,
  type RosterUser,
} from '../../../src/services/classes/classRoster.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock = { now: () => FIXED }

interface RosterReaderOverrides {
  getClassById?: ClassRosterReader['getClassById']
  findStudents?: ClassRosterReader['findStudents']
  resolveClassNames?: ClassRosterReader['resolveClassNames']
}

const makeRosterUser = (id: number, name: string, classId?: string): RosterUser => ({
  _id: new Types.ObjectId(id.toString(16).padStart(24, '0')),
  email: `${name.toLowerCase()}@example.test`,
  name,
  classId,
  metadata: {
    createdAt: FIXED,
    updatedAt: FIXED,
    sources: {},
  },
})

const makeReader = (overrides: RosterReaderOverrides = {}): ClassRosterReader => ({
  getClassById: jest.fn(async () => ({ name: 'Turma X', source: 'hotmart' })),
  findCurseducaMemberIds: jest.fn(async () => []),
  findStudents: jest.fn(async () => [makeRosterUser(1, 'Ana')]),
  countStudents: jest.fn(async () => 1),
  searchStudents: jest.fn(async () => [
    makeRosterUser(1, 'Ana', 'C1'),
    makeRosterUser(2, 'Bea', 'C1'),
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

describe('classRoster sort field mapping', () => {
  it('maps each public key to its real Mongo path', () => {
    expect(resolveSortPath('name', false)).toBe('name')
    expect(resolveSortPath('email', false)).toBe('email')
    expect(resolveSortPath('createdAt', false)).toBe('metadata.createdAt')
    expect(resolveSortPath('status', false)).toBe('combined.status')
  })

  it('resolves joinedAt differently for CursEduca and Hotmart', () => {
    expect(resolveSortPath('joinedAt', true)).toBe('curseduca.joinedDate')
    expect(resolveSortPath('joinedAt', false)).toBe('hotmart.purchaseDate')
  })

  it('falls back an unknown key to name', () => {
    expect(resolveSortPath('$where', false)).toBe('name')
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

  it('sorts the roster by the mapped Mongo path with an _id tiebreak', async () => {
    const findStudents = jest.fn(async () => [] as RosterUser[])
    const service = new ClassRosterService(makeReader({ findStudents }), fixedClock)
    await service.getStudents('C1', { includeInactive: false, limit: 100, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' })
    expect(findStudents).toHaveBeenCalledWith(expect.anything(), { 'metadata.createdAt': -1, _id: 1 }, 100, 0)
  })

  it('maps joinedAt to the source-specific path', async () => {
    const hotmartFind = jest.fn(async () => [] as RosterUser[])
    await new ClassRosterService(makeReader({ findStudents: hotmartFind }), fixedClock)
      .getStudents('C1', { includeInactive: false, limit: 100, offset: 0, sortBy: 'joinedAt', sortOrder: 'asc' })
    expect(hotmartFind).toHaveBeenCalledWith(expect.anything(), { 'hotmart.purchaseDate': 1, _id: 1 }, 100, 0)

    const cursFind = jest.fn(async () => [] as RosterUser[])
    await new ClassRosterService(
      makeReader({ getClassById: jest.fn(async () => ({ name: 'C', source: 'curseduca_sync' })), findStudents: cursFind }),
      fixedClock,
    ).getStudents('C1', { includeInactive: false, limit: 100, offset: 0, sortBy: 'joinedAt', sortOrder: 'asc' })
    expect(cursFind).toHaveBeenCalledWith(expect.anything(), { 'curseduca.joinedDate': 1, _id: 1 }, 100, 0)
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
