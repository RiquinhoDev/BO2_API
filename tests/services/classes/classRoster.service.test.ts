import {
  ClassRosterService,
  type ClassRosterReader,
  type ClassRosterSummary,
  type Clock,
  type RosterUser,
} from '../../../src/services/classes/classRoster.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock: Clock = { now: () => FIXED }

class StubReader implements ClassRosterReader {
  async getClassById(): Promise<ClassRosterSummary | null> {
    return { name: 'Turma X', source: 'hotmart' }
  }
  async findCurseducaMemberIds(): Promise<unknown[]> {
    return []
  }
  async findStudents(): Promise<RosterUser[]> {
    return [{ _id: 'u1', name: 'Ana', email: 'ana@b.test', metadata: { createdAt: FIXED } }]
  }
  async countStudents(): Promise<number> {
    return 1
  }
  async searchStudents(): Promise<RosterUser[]> {
    return [{ _id: 'u1', name: 'Ana', email: 'ana@b.test' }]
  }
  async countSearch(): Promise<number> {
    return 1
  }
  async resolveClassName(): Promise<string | null> {
    return 'Turma X'
  }
}

describe('ClassRosterService', () => {
  const service = new ClassRosterService(new StubReader(), fixedClock)

  it('stamps the injected clock exactly on the roster', async () => {
    const result = await service.getStudents('C1', {
      includeInactive: false,
      limit: 100,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') expect(result.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('stamps the injected clock exactly on the search', async () => {
    const result = await service.search({ email: 'ana@b.test', limit: 50, offset: 0 })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') expect(result.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })
})
