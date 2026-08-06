import {
  ClassHistoryService,
  type ChangeDoc,
  type ClassHistoryDegradationReporter,
  type ClassHistoryReader,
  type ClassSummary,
  type Clock,
  type HistoryRecord,
  type MovementDoc,
  type StudentRef,
  type SyncDoc,
  type UserDoc,
} from '../../../src/services/classes/classHistory.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock: Clock = { now: () => FIXED }

const SECRET = 'secret-internal-detail'

/** In-memory reader; movements throws so the degradation path is exercised. */
class StubReader implements ClassHistoryReader {
  async getClassById(): Promise<ClassSummary | null> {
    return { name: 'Turma X', source: 'hotmart' }
  }
  async countHistory(): Promise<number> {
    return 0
  }
  async findHistory(): Promise<HistoryRecord[]> {
    return []
  }
  async listMovements(): Promise<MovementDoc[]> {
    throw new Error(SECRET)
  }
  async listStudents(): Promise<StudentRef[]> {
    return [{ _id: 'u1' }]
  }
  async listUserChanges(): Promise<ChangeDoc[]> {
    return [{ changeDate: new Date('2026-01-01T00:00:00.000Z'), changeType: 'EMAIL_CHANGE', userEmail: 'a@b.test' }]
  }
  async listSyncs(): Promise<SyncDoc[]> {
    return [{ startedAt: new Date('2026-01-03T00:00:00.000Z'), type: 'hotmart', status: 'completed' }]
  }
  async findUserByDiscord(): Promise<UserDoc | null> {
    return { _id: 'u1', name: 'Ana', email: 'ana@b.test' }
  }
  async findUserByEmail(): Promise<UserDoc | null> {
    return { _id: 'u1', name: 'Ana', email: 'ana@b.test' }
  }
  async countByStudent(): Promise<number> {
    return 1
  }
  async findByStudent(): Promise<HistoryRecord[]> {
    return []
  }
}

const makeReporter = () => {
  const report = jest.fn<void, [string, unknown]>()
  const reporter: ClassHistoryDegradationReporter = { report }
  return { reporter, report }
}

describe('ClassHistoryService', () => {
  it('stamps the injected clock exactly', async () => {
    const { reporter } = makeReporter()
    const service = new ClassHistoryService(new StubReader(), fixedClock, reporter)

    const listed = await service.listHistory({ limit: 50, offset: 0 })
    expect(listed.timestamp).toBe('2026-01-02T03:04:05.000Z')

    const complete = await service.completeHistory('C1', { limit: 50, offset: 0 })
    expect(complete.kind).toBe('ok')
    if (complete.kind === 'ok') expect(complete.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('reports a degraded source, keeps the others, and leaks no internal detail', async () => {
    const { reporter, report } = makeReporter()
    const service = new ClassHistoryService(new StubReader(), fixedClock, reporter)

    const result = await service.completeHistory('C1', { limit: 50, offset: 0 })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return

    // Remaining sources survive; the failed movements source is absent.
    expect(result.history.map(entry => entry.type)).toEqual(['SYNC', 'USER_CHANGE'])
    // The degradation is reported with the correct source and the raw error.
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('movements', expect.any(Error))
    // The internal detail never reaches the returned payload.
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })
})
