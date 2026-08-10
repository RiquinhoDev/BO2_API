import {
  ClassDetailsService,
  type ClassDetailsReader,
  type ClassStatsData,
  type Clock,
} from '../../../src/services/classes/classDetails.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock: Clock = { now: () => FIXED }

const EMPTY_STATS: ClassStatsData = {
  totalClasses: 0,
  totalStudents: 0,
  activeClasses: 0,
  inactiveClasses: 0,
  recentMovements: 0,
  sourceBreakdown: { hotmart_sync: 0, manual: 0, import: 0, curseduca_sync: 0 },
  studentDistribution: [],
}

const reader: ClassDetailsReader = {
  classStats: jest.fn(async () => EMPTY_STATS),
  inactivationCounts: jest.fn(async () => ({ pendingLists: 0, completedLists: 0 })),
  classDetails: jest.fn(async () => ({ classId: 'H' })),
  fetchMultiple: jest.fn(async () => [{ classId: 'H' }]),
  fetchAll: jest.fn(async () => [{ classId: 'H' }]),
}

describe('ClassDetailsService', () => {
  const service = new ClassDetailsService(reader, fixedClock)

  it('stamps the injected clock exactly on stats, details and fetch', async () => {
    const stats = await service.stats({})
    expect(stats.timestamp).toBe('2026-01-02T03:04:05.000Z')
    expect(stats.data.inactivationStats).toEqual({ pendingLists: 0, completedLists: 0 })

    const details = await service.details('H', {})
    expect(details.kind).toBe('ok')
    if (details.kind === 'ok') expect(details.timestamp).toBe('2026-01-02T03:04:05.000Z')

    const fetched = await service.fetch(['H'], { includeStudents: true })
    expect(fetched.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('routes fetch to fetchMultiple with ids and fetchAll without', async () => {
    await service.fetch(['H'], {})
    expect(reader.fetchMultiple).toHaveBeenCalled()
    await service.fetch(undefined, {})
    expect(reader.fetchAll).toHaveBeenCalled()
  })
})
