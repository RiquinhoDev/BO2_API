import type { TimedCache } from './inMemoryTtlCache'

export interface ClassAnalyticsSnapshot {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  healthScore: number
  averageProgress: number
  lastCalculatedAt: Date
}

export interface ClassAnalyticsReader {
  getClassAnalytics(
    classId: string,
  ): Promise<ClassAnalyticsSnapshot | null>
}

interface ClassComparisonMetrics {
  classId: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  healthScore: number
  averageProgress: number
  lastCalculated: string
}

export interface SuccessfulClassComparisonRow
  extends ClassComparisonMetrics {
  className: string
  error?: never
}

export interface FailedClassComparisonRow extends ClassComparisonMetrics {
  className?: never
  error: string
}

export type ClassComparisonRow =
  | SuccessfulClassComparisonRow
  | FailedClassComparisonRow

export interface ClassComparisonData {
  comparisons: ClassComparisonRow[]
  summary: {
    totalStudentsSum: number
    averageEngagementMean: number
    healthScoreMean: number
    bestPerformingClass: SuccessfulClassComparisonRow
    worstPerformingClass: SuccessfulClassComparisonRow
  }
  validComparisons: number
  totalRequested: number
  calculationDuration: number
  lastUpdated: string
  cached: boolean
}

export type ClassComparisonResult =
  | { found: false }
  | {
      found: true
      data: ClassComparisonData
      timestamp: number
      cacheAge?: number
    }

const missingRow = (classId: string): FailedClassComparisonRow => ({
  classId,
  totalStudents: 0,
  activeStudents: 0,
  averageEngagement: 0,
  healthScore: 0,
  averageProgress: 0,
  lastCalculated: '',
  error: 'Turma não encontrada',
})

const failedRow = (classId: string): FailedClassComparisonRow => ({
  ...missingRow(classId),
  error: 'Erro ao obter analytics da turma',
})

const successfulRow = (
  analytics: ClassAnalyticsSnapshot,
): SuccessfulClassComparisonRow => ({
  classId: analytics.classId,
  className: analytics.className,
  totalStudents: analytics.totalStudents,
  activeStudents: analytics.activeStudents,
  averageEngagement: analytics.averageEngagement,
  healthScore: analytics.healthScore,
  averageProgress: analytics.averageProgress,
  lastCalculated: analytics.lastCalculatedAt.toISOString(),
})

const isSuccessful = (
  comparison: ClassComparisonRow,
): comparison is SuccessfulClassComparisonRow =>
  comparison.error === undefined

export class ClassComparisonService {
  constructor(
    private readonly reader: ClassAnalyticsReader,
    private readonly cache: TimedCache<ClassComparisonData>,
    private readonly now: () => number = Date.now,
  ) {}

  async compare(classIds: string[]): Promise<ClassComparisonResult> {
    const startedAt = this.now()
    const cacheKey = JSON.stringify(classIds)
    const cached = this.cache.get(cacheKey, startedAt)

    if (cached) {
      return {
        found: true,
        data: {
          ...cached.value,
          cached: true,
        },
        timestamp: cached.storedAt,
        cacheAge: Math.round((startedAt - cached.storedAt) / 1_000),
      }
    }

    const comparisons = await Promise.all(
      classIds.map(async (classId): Promise<ClassComparisonRow> => {
        try {
          const analytics = await this.reader.getClassAnalytics(classId)
          return analytics ? successfulRow(analytics) : missingRow(classId)
        } catch {
          return failedRow(classId)
        }
      }),
    )
    const validComparisons = comparisons.filter(isSuccessful)
    const [firstValid, ...remainingValid] = validComparisons

    if (!firstValid) {
      return { found: false }
    }

    const bestPerformingClass = remainingValid.reduce(
      (best, current) =>
        current.healthScore > best.healthScore ? current : best,
      firstValid,
    )
    const worstPerformingClass = remainingValid.reduce(
      (worst, current) =>
        current.healthScore < worst.healthScore ? current : worst,
      firstValid,
    )
    const finishedAt = this.now()
    const data: ClassComparisonData = {
      comparisons,
      summary: {
        totalStudentsSum: validComparisons.reduce(
          (total, comparison) => total + comparison.totalStudents,
          0,
        ),
        averageEngagementMean: Math.round(
          validComparisons.reduce(
            (total, comparison) => total + comparison.averageEngagement,
            0,
          ) / validComparisons.length,
        ),
        healthScoreMean: Math.round(
          validComparisons.reduce(
            (total, comparison) => total + comparison.healthScore,
            0,
          ) / validComparisons.length,
        ),
        bestPerformingClass,
        worstPerformingClass,
      },
      validComparisons: validComparisons.length,
      totalRequested: classIds.length,
      calculationDuration: finishedAt - startedAt,
      lastUpdated: new Date(finishedAt).toISOString(),
      cached: false,
    }

    this.cache.set(cacheKey, data, finishedAt)

    return {
      found: true,
      data,
      timestamp: finishedAt,
    }
  }
}
