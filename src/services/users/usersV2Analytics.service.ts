import { calculateHealthScore } from '../analytics/healthScore'
import { normalizePlatformEngagement } from '../syncUtilizadoresServices/engagement/platformEngagementNormalizer'

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

export interface UsersV2ComparisonProduct {
  id: string
  name: string
  platform: string
}

export interface UsersV2ComparisonEnrollment {
  userId: string
  productId: string
  platform: string
  engagement: unknown
}

export interface UsersV2ComparisonSnapshot {
  products: UsersV2ComparisonProduct[]
  enrollments: UsersV2ComparisonEnrollment[]
}

export interface UsersV2ComparisonReader {
  read(): Promise<UsersV2ComparisonSnapshot>
}

interface UsersV2ComparisonBand {
  count: number
  percentage: number
}

export interface UsersV2ComparisonResult {
  productId: string
  productName: string
  platform: string
  totalStudents: number
  avgScore: number
  trend: 0
  distribution: {
    alto: UsersV2ComparisonBand
    medio: UsersV2ComparisonBand
    baixo: UsersV2ComparisonBand
    risco: UsersV2ComparisonBand
  }
}

const percentage = (count: number, total: number): number =>
  total === 0 ? 0 : Math.round((count / total) * 100)

export class UsersV2ComparisonService {
  constructor(private readonly reader: UsersV2ComparisonReader) {}

  async get(): Promise<UsersV2ComparisonResult[]> {
    const snapshot = await this.reader.read()
    const byUser = new Map<string, UsersV2ComparisonEnrollment[]>()
    const userAverage = new Map<string, number>()
    const scoresByProduct = new Map<string, number[]>()

    for (const enrollment of snapshot.enrollments) {
      const userEnrollments = byUser.get(enrollment.userId)
      if (userEnrollments) {
        userEnrollments.push(enrollment)
      } else {
        byUser.set(enrollment.userId, [enrollment])
      }
    }

    for (const [userId, userEnrollments] of byUser) {
      let scoreSum = 0
      let scoreCount = 0

      for (const enrollment of userEnrollments) {
        const score = normalizePlatformEngagement(
          enrollment.platform,
          enrollment.engagement,
        )
        if (score <= 0) continue
        scoreSum += score
        scoreCount += 1
      }

      userAverage.set(
        userId,
        scoreCount === 0 ? 0 : Math.round(scoreSum / scoreCount),
      )
    }

    for (const enrollment of snapshot.enrollments) {
      const productScores = scoresByProduct.get(enrollment.productId)
      const score = userAverage.get(enrollment.userId) ?? 0
      if (productScores) {
        productScores.push(score)
      } else {
        scoresByProduct.set(enrollment.productId, [score])
      }
    }

    const results: UsersV2ComparisonResult[] = []

    for (const product of snapshot.products) {
      const scores = scoresByProduct.get(product.id) ?? []
      let scoreSum = 0
      let alto = 0
      let medio = 0
      let baixo = 0
      let risco = 0

      for (const score of scores) {
        scoreSum += score

        if (score >= 60) {
          alto += 1
        } else if (score >= 40) {
          medio += 1
        } else if (score >= 25) {
          baixo += 1
        } else {
          risco += 1
        }
      }

      const totalStudents = scores.length
      results.push({
        productId: product.id,
        productName: product.name,
        platform: product.platform,
        totalStudents,
        avgScore: totalStudents === 0
          ? 0
          : Math.round(scoreSum / totalStudents),
        trend: 0,
        distribution: {
          alto: {
            count: alto,
            percentage: percentage(alto, totalStudents),
          },
          medio: {
            count: medio,
            percentage: percentage(medio, totalStudents),
          },
          baixo: {
            count: baixo,
            percentage: percentage(baixo, totalStudents),
          },
          risco: {
            count: risco,
            percentage: percentage(risco, totalStudents),
          },
        },
      })
    }

    return results.sort((left, right) => {
      const totalDifference = right.totalStudents - left.totalStudents
      if (totalDifference !== 0) return totalDifference
      if (left.productId < right.productId) return -1
      if (left.productId > right.productId) return 1
      return 0
    })
  }
}
