import {
  GlobalAnalyticsService,
  type GlobalAnalyticsRead,
  type GlobalAnalyticsReader,
} from '../../../src/services/analytics/globalAnalytics.service'
import { InMemoryTtlCache } from '../../../src/services/analytics/inMemoryTtlCache'

const populatedRead: GlobalAnalyticsRead = {
  totalClasses: 2,
  totalStudents: 3,
  activeStudents: 2,
  averageEngagement: 60,
  engagementDistribution: {
    muito_alto: 1,
    alto: 0,
    medio: 1,
    baixo: 0,
    muito_baixo: 1,
  },
}

const emptyRead: GlobalAnalyticsRead = {
  totalClasses: 0,
  totalStudents: 0,
  activeStudents: 0,
  averageEngagement: 0,
  engagementDistribution: {
    muito_alto: 0,
    alto: 0,
    medio: 0,
    baixo: 0,
    muito_baixo: 0,
  },
}

class CountingReader implements GlobalAnalyticsReader {
  calls = 0

  constructor(private readonly reads: GlobalAnalyticsRead[]) {}

  async read(): Promise<GlobalAnalyticsRead> {
    const result = this.reads[Math.min(this.calls, this.reads.length - 1)]
    this.calls += 1

    if (!result) {
      throw new Error('No read fixture available')
    }

    return result
  }
}

const sequenceClock = (values: number[]) => {
  let index = 0

  return () => {
    const value = values[index]
    index += 1

    if (value === undefined) {
      throw new Error('No clock fixture available')
    }

    return value
  }
}

describe('GlobalAnalyticsService', () => {
  it('derives the complete fresh analytics result', async () => {
    const service = new GlobalAnalyticsService(
      new CountingReader([populatedRead]),
      new InMemoryTtlCache(300_000),
      sequenceClock([1_000, 1_010]),
    )

    await expect(service.get()).resolves.toEqual({
      data: {
        ...populatedRead,
        inactiveStudents: 1,
        activityRate: 67,
        calculationDuration: 10,
        lastUpdated: new Date(1_010).toISOString(),
      },
      cached: false,
      empty: false,
      timestamp: 1_010,
      calculationDuration: 10,
    })
  })

  it('returns a Front-compatible zero result without synthetic metadata', async () => {
    const service = new GlobalAnalyticsService(
      new CountingReader([emptyRead]),
      new InMemoryTtlCache(300_000),
      sequenceClock([1_000, 1_010]),
    )

    await expect(service.get()).resolves.toEqual({
      data: {
        ...emptyRead,
        inactiveStudents: 0,
        activityRate: 0,
        message: 'Nenhuma turma ativa encontrada',
      },
      cached: false,
      empty: true,
    })
  })

  it('serves a cache hit without reading again', async () => {
    const reader = new CountingReader([populatedRead])
    const service = new GlobalAnalyticsService(
      reader,
      new InMemoryTtlCache(300_000),
      sequenceClock([1_000, 1_010, 31_010]),
    )

    await service.get()

    await expect(service.get()).resolves.toEqual({
      data: expect.objectContaining({
        totalClasses: 2,
        calculationDuration: 10,
      }),
      cached: true,
      timestamp: 1_010,
      cacheAge: 30,
    })
    expect(reader.calls).toBe(1)
  })

  it('replaces an entry at the TTL boundary', async () => {
    const refreshedRead: GlobalAnalyticsRead = {
      ...populatedRead,
      totalStudents: 4,
      activeStudents: 4,
    }
    const reader = new CountingReader([populatedRead, refreshedRead])
    const service = new GlobalAnalyticsService(
      reader,
      new InMemoryTtlCache(300_000),
      sequenceClock([1_000, 1_010, 301_010, 301_020]),
    )

    await service.get()

    await expect(service.get()).resolves.toMatchObject({
      data: {
        totalStudents: 4,
        activeStudents: 4,
        inactiveStudents: 0,
        activityRate: 100,
      },
      cached: false,
      empty: false,
      timestamp: 301_020,
    })
    expect(reader.calls).toBe(2)
  })
})
