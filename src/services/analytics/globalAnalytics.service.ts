import type { TimedCache } from './inMemoryTtlCache'

export interface EngagementDistribution {
  muito_alto: number
  alto: number
  medio: number
  baixo: number
  muito_baixo: number
}

export interface GlobalAnalyticsRead {
  totalClasses: number
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  engagementDistribution: EngagementDistribution
}

export interface GlobalAnalyticsReader {
  read(): Promise<GlobalAnalyticsRead>
}

export interface GlobalAnalyticsData extends GlobalAnalyticsRead {
  inactiveStudents: number
  activityRate: number
  calculationDuration?: number
  lastUpdated?: string
  message?: 'Nenhuma turma ativa encontrada'
}

export type GlobalAnalyticsResult =
  | {
      data: GlobalAnalyticsData
      cached: true
      timestamp: number
      cacheAge: number
    }
  | {
      data: GlobalAnalyticsData
      cached: false
      empty: true
    }
  | {
      data: GlobalAnalyticsData
      cached: false
      empty: false
      timestamp: number
      calculationDuration: number
    }

const CACHE_KEY = 'global-analytics'

export class GlobalAnalyticsService {
  constructor(
    private readonly reader: GlobalAnalyticsReader,
    private readonly cache: TimedCache<GlobalAnalyticsData>,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<GlobalAnalyticsResult> {
    const startedAt = this.now()
    const cached = this.cache.get(CACHE_KEY, startedAt)

    if (cached) {
      return {
        data: cached.value,
        cached: true,
        timestamp: cached.storedAt,
        cacheAge: Math.round((startedAt - cached.storedAt) / 1_000),
      }
    }

    const read = await this.reader.read()
    const inactiveStudents = read.totalStudents - read.activeStudents
    const activityRate = read.totalStudents > 0
      ? Math.round((read.activeStudents / read.totalStudents) * 100)
      : 0

    if (read.totalClasses === 0) {
      return {
        data: {
          ...read,
          inactiveStudents,
          activityRate,
          message: 'Nenhuma turma ativa encontrada',
        },
        cached: false,
        empty: true,
      }
    }

    const finishedAt = this.now()
    const calculationDuration = finishedAt - startedAt
    const data: GlobalAnalyticsData = {
      ...read,
      inactiveStudents,
      activityRate,
      calculationDuration,
      lastUpdated: new Date(finishedAt).toISOString(),
    }

    this.cache.set(CACHE_KEY, data, finishedAt)

    return {
      data,
      cached: false,
      empty: false,
      timestamp: finishedAt,
      calculationDuration,
    }
  }
}
