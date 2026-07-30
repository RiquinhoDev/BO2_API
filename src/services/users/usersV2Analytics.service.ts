import { calculateHealthScore } from '../analytics/healthScore'

export interface UsersV2StatsSnapshot {
  totalStudents: number
  engagementSum: number
  progressSum: number
  atRiskCount: number
  inactive30d: number
  new7d: number
  activeProducts: number
  byPlatform: Array<{ platform: string; count: number }>
}

export interface UsersV2StatsReader {
  read(now: Date): Promise<UsersV2StatsSnapshot>
}

export interface Clock {
  now(): Date
}

export interface UsersV2StatsResult {
  success: true
  data: {
    overview: {
      totalStudents: number
      avgEngagement: number
      avgProgress: number
      activeCount: number
      activeRate: number
      atRiskCount: number
      atRiskRate: number
      activeProducts: number
      healthScore: number
      healthLevel: 'EXCELENTE' | 'BOM' | 'RAZOÁVEL' | 'CRÍTICO'
      healthBreakdown: {
        engagement: number
        retention: number
        growth: number
        progress: number
      }
    }
    byPlatform: Array<{
      name: string
      count: number
      percentage: number
      icon: string
    }>
    quickFilters: {
      atRisk: number
      topPerformers: number
      inactive30d: number
      new7d: number
    }
    meta: {
      calculatedAt: string
      durationMs: 0
    }
  }
}

const platformIcon = (platform: string): string => {
  if (platform === 'hotmart') return '🔥'
  if (platform === 'curseduca') return '📚'
  if (platform === 'discord') return '💬'
  return '🌟'
}

const platformName = (platform: string): string =>
  platform.charAt(0).toUpperCase() + platform.slice(1)

export class UsersV2StatsService {
  constructor(
    private readonly reader: UsersV2StatsReader,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<UsersV2StatsResult> {
    const calculatedAt = this.clock.now()
    const snapshot = await this.reader.read(calculatedAt)
    const {
      totalStudents,
      engagementSum,
      progressSum,
      atRiskCount,
      inactive30d,
      new7d,
      activeProducts,
    } = snapshot
    const avgEngagement = totalStudents === 0
      ? 0
      : engagementSum / totalStudents
    const avgProgress = totalStudents === 0
      ? 0
      : progressSum / totalStudents
    const atRiskRate = totalStudents === 0
      ? 0
      : (atRiskCount / totalStudents) * 100
    const activeRate = totalStudents === 0 ? 0 : 100
    const health = calculateHealthScore({
      avgEngagement,
      activeCount: totalStudents,
      totalCount: totalStudents,
      newLast7Days: new7d,
      avgProgress,
    })
    const byPlatform = snapshot.byPlatform
      .map(({ platform, count }) => ({
        name: platformName(platform),
        count,
        percentage: totalStudents === 0
          ? 0
          : Number(((count / totalStudents) * 100).toFixed(1)),
        icon: platformIcon(platform),
      }))
      .sort((left, right) => right.count - left.count)

    return {
      success: true,
      data: {
        overview: {
          totalStudents,
          avgEngagement,
          avgProgress,
          activeCount: totalStudents,
          activeRate,
          atRiskCount,
          atRiskRate,
          activeProducts,
          ...health,
        },
        byPlatform,
        quickFilters: {
          atRisk: atRiskCount,
          topPerformers: Math.ceil(totalStudents * 0.1),
          inactive30d,
          new7d,
        },
        meta: {
          calculatedAt: calculatedAt.toISOString(),
          durationMs: 0,
        },
      },
    }
  }
}
