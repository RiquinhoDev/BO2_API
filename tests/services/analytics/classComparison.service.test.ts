import {
  ClassComparisonService,
  type ClassAnalyticsReader,
  type ClassAnalyticsSnapshot,
} from '../../../src/services/analytics/classComparison.service'
import { InMemoryTtlCache } from '../../../src/services/analytics/inMemoryTtlCache'

const classA: ClassAnalyticsSnapshot = {
  classId: 'class-a',
  className: 'Class A',
  totalStudents: 10,
  activeStudents: 5,
  averageEngagement: 40,
  healthScore: 50,
  averageProgress: 30,
  lastCalculatedAt: new Date(700),
}

const classB: ClassAnalyticsSnapshot = {
  classId: 'class-b',
  className: 'Class B',
  totalStudents: 20,
  activeStudents: 15,
  averageEngagement: 80,
  healthScore: 90,
  averageProgress: 70,
  lastCalculatedAt: new Date(800),
}

const createReader = (
  values: Map<string, ClassAnalyticsSnapshot | null | Error>,
) => {
  const reads: string[] = []
  const reader: ClassAnalyticsReader = {
    async getClassAnalytics(classId) {
      reads.push(classId)
      const value = values.get(classId) ?? null
      if (value instanceof Error) throw value
      return value
    },
  }

  return { reader, reads }
}

const sequenceClock = (...values: number[]) => {
  let index = 0
  return () => {
    const value = values[Math.min(index, values.length - 1)]
    index += 1
    return value
  }
}

describe('ClassComparisonService', () => {
  it('preserves requested order and derives the summary from valid classes', async () => {
    const { reader } = createReader(new Map<
      string,
      ClassAnalyticsSnapshot | null | Error
    >([
      ['class-a', classA],
      ['class-b', classB],
    ]))
    const service = new ClassComparisonService(
      reader,
      new InMemoryTtlCache(5_000),
      sequenceClock(1_000, 1_025),
    )

    const result = await service.compare(['class-b', 'class-a'])

    expect(result).toEqual({
      found: true,
      timestamp: 1_025,
      data: {
        comparisons: [
          {
            classId: 'class-b',
            className: 'Class B',
            totalStudents: 20,
            activeStudents: 15,
            averageEngagement: 80,
            healthScore: 90,
            averageProgress: 70,
            lastCalculated: new Date(800).toISOString(),
          },
          {
            classId: 'class-a',
            className: 'Class A',
            totalStudents: 10,
            activeStudents: 5,
            averageEngagement: 40,
            healthScore: 50,
            averageProgress: 30,
            lastCalculated: new Date(700).toISOString(),
          },
        ],
        summary: {
          totalStudentsSum: 30,
          averageEngagementMean: 60,
          healthScoreMean: 70,
          bestPerformingClass: expect.objectContaining({
            classId: 'class-b',
          }),
          worstPerformingClass: expect.objectContaining({
            classId: 'class-a',
          }),
        },
        validComparisons: 2,
        totalRequested: 2,
        calculationDuration: 25,
        lastUpdated: new Date(1_025).toISOString(),
        cached: false,
      },
    })
  })

  it('returns complete public error rows and excludes them from the summary', async () => {
    const { reader } = createReader(new Map<
      string,
      ClassAnalyticsSnapshot | null | Error
    >([
      ['class-a', classA],
      ['missing', null],
      ['failed', new Error('database-secret-detail')],
    ]))
    const service = new ClassComparisonService(
      reader,
      new InMemoryTtlCache(5_000),
      sequenceClock(2_000, 2_010),
    )

    const result = await service.compare(['class-a', 'missing', 'failed'])

    expect(result.found).toBe(true)
    if (!result.found) throw new Error('expected a populated comparison')

    expect(result.data.comparisons).toEqual([
      {
        classId: 'class-a',
        className: 'Class A',
        totalStudents: 10,
        activeStudents: 5,
        averageEngagement: 40,
        healthScore: 50,
        averageProgress: 30,
        lastCalculated: new Date(700).toISOString(),
      },
      {
        classId: 'missing',
        totalStudents: 0,
        activeStudents: 0,
        averageEngagement: 0,
        healthScore: 0,
        averageProgress: 0,
        lastCalculated: '',
        error: 'Turma não encontrada',
      },
      {
        classId: 'failed',
        totalStudents: 0,
        activeStudents: 0,
        averageEngagement: 0,
        healthScore: 0,
        averageProgress: 0,
        lastCalculated: '',
        error: 'Erro ao obter analytics da turma',
      },
    ])
    expect(result.data.summary).toMatchObject({
      totalStudentsSum: 10,
      averageEngagementMean: 40,
      healthScoreMean: 50,
      bestPerformingClass: { classId: 'class-a' },
      worstPerformingClass: { classId: 'class-a' },
    })
    expect(result.data.validComparisons).toBe(1)
    expect(result.data.totalRequested).toBe(3)
    expect(JSON.stringify(result.data)).not.toContain('database-secret-detail')
  })

  it('does not cache a comparison with no valid class', async () => {
    const { reader, reads } = createReader(new Map<
      string,
      ClassAnalyticsSnapshot | null | Error
    >([
      ['missing', null],
      ['failed', new Error('database-secret-detail')],
    ]))
    const service = new ClassComparisonService(
      reader,
      new InMemoryTtlCache(5_000),
      sequenceClock(3_000, 3_100),
    )

    await expect(service.compare(['missing', 'failed']))
      .resolves.toEqual({ found: false })
    await expect(service.compare(['missing', 'failed']))
      .resolves.toEqual({ found: false })
    expect(reads).toEqual(['missing', 'failed', 'missing', 'failed'])
  })

  it('caches by ordered normalized identifiers without mutating stored data', async () => {
    const { reader, reads } = createReader(new Map<
      string,
      ClassAnalyticsSnapshot | null | Error
    >([
      ['class-a', classA],
      ['class-b', classB],
    ]))
    const service = new ClassComparisonService(
      reader,
      new InMemoryTtlCache(5_000),
      sequenceClock(4_000, 4_025, 4_100, 4_200, 4_225),
    )

    const fresh = await service.compare(['class-a', 'class-b'])
    const cached = await service.compare(['class-a', 'class-b'])
    const reversed = await service.compare(['class-b', 'class-a'])

    expect(fresh.found && fresh.data.cached).toBe(false)
    expect(cached).toMatchObject({
      found: true,
      timestamp: 4_025,
      cacheAge: 0,
      data: {
        cached: true,
        comparisons: [
          { classId: 'class-a' },
          { classId: 'class-b' },
        ],
      },
    })
    expect(reversed).toMatchObject({
      found: true,
      data: {
        cached: false,
        comparisons: [
          { classId: 'class-b' },
          { classId: 'class-a' },
        ],
      },
    })
    expect(reads).toEqual([
      'class-a',
      'class-b',
      'class-b',
      'class-a',
    ])
  })

  it('expires a cached comparison at the exact TTL boundary', async () => {
    const { reader, reads } = createReader(new Map<
      string,
      ClassAnalyticsSnapshot | null | Error
    >([
      ['class-a', classA],
      ['class-b', classB],
    ]))
    const service = new ClassComparisonService(
      reader,
      new InMemoryTtlCache(2_000),
      sequenceClock(5_000, 5_025, 7_024, 7_025, 7_050),
    )

    const fresh = await service.compare(['class-a', 'class-b'])
    const beforeBoundary = await service.compare(['class-a', 'class-b'])
    const atBoundary = await service.compare(['class-a', 'class-b'])

    expect(fresh.found && fresh.data.cached).toBe(false)
    expect(beforeBoundary.found && beforeBoundary.data.cached).toBe(true)
    expect(atBoundary.found && atBoundary.data.cached).toBe(false)
    expect(reads).toHaveLength(4)
  })
})
