import UserProduct from '../../../models/UserProduct'
import { normalizePlatformEngagement } from './platformEngagementNormalizer'

export interface NormalizedEngagement {
  platform: string
  originalScore: unknown
  normalizedScore: number
  weight: number
}

export interface AverageEngagementResult {
  userId: string
  averageScore: number
  level: EngagementLevel
  breakdown: NormalizedEngagement[]
  totalPlatforms: number
}

export type EngagementLevel = 'MUITO_BAIXO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO'

export async function calculateUserAverageEngagement(
  userId: string,
): Promise<AverageEngagementResult> {
  const userProducts = await UserProduct.find({
    userId,
    status: 'ACTIVE',
  }).lean()

  if (userProducts.length === 0) {
    return {
      userId,
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: 0,
    }
  }

  const normalized: NormalizedEngagement[] = []

  for (const up of userProducts) {
    const normalizedScore = normalizePlatformEngagement(up.platform, up.engagement)

    if (normalizedScore > 0) {
      normalized.push({
        platform: up.platform,
        originalScore: up.engagement,
        normalizedScore,
        weight: 1.0,
      })
    }
  }

  if (normalized.length === 0) {
    return {
      userId,
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: userProducts.length,
    }
  }

  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0)
  const weightedSum = normalized.reduce(
    (sum, item) => sum + (item.normalizedScore * item.weight),
    0,
  )
  const averageScore = Math.round(weightedSum / totalWeight)

  return {
    userId,
    averageScore,
    level: getEngagementLevel(averageScore),
    breakdown: normalized,
    totalPlatforms: userProducts.length,
  }
}

export async function calculateBatchAverageEngagement(
  userIds: string[],
): Promise<Map<string, AverageEngagementResult>> {
  const results = new Map<string, AverageEngagementResult>()
  const userProducts = await UserProduct.find({
    userId: { $in: userIds },
    status: 'ACTIVE',
  }).lean()
  const byUser = new Map<string, typeof userProducts>()

  userProducts.forEach(up => {
    const userId = up.userId.toString()
    const products = byUser.get(userId)

    if (products) {
      products.push(up)
    } else {
      byUser.set(userId, [up])
    }
  })

  for (const [userId, products] of byUser.entries()) {
    const normalized: NormalizedEngagement[] = []

    for (const up of products) {
      const normalizedScore = normalizePlatformEngagement(up.platform, up.engagement)

      if (normalizedScore > 0) {
        normalized.push({
          platform: up.platform,
          originalScore: up.engagement,
          normalizedScore,
          weight: 1.0,
        })
      }
    }

    let averageScore = 0

    if (normalized.length > 0) {
      const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0)
      const weightedSum = normalized.reduce(
        (sum, item) => sum + (item.normalizedScore * item.weight),
        0,
      )
      averageScore = Math.round(weightedSum / totalWeight)
    }

    results.set(userId, {
      userId,
      averageScore,
      level: getEngagementLevel(averageScore),
      breakdown: normalized,
      totalPlatforms: products.length,
    })
  }

  for (const userId of userIds) {
    if (!results.has(userId)) {
      results.set(userId, {
        userId,
        averageScore: 0,
        level: 'MUITO_BAIXO',
        breakdown: [],
        totalPlatforms: 0,
      })
    }
  }

  return results
}

export function getEngagementLevel(score: number): EngagementLevel {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  return 'MUITO_BAIXO'
}

export function getEngagementColor(level: EngagementLevel): string {
  switch (level) {
    case 'MUITO_ALTO':
      return 'bg-green-100 text-green-800'
    case 'ALTO':
      return 'bg-blue-100 text-blue-800'
    case 'MEDIO':
      return 'bg-yellow-100 text-yellow-800'
    case 'BAIXO':
      return 'bg-orange-100 text-orange-800'
    case 'MUITO_BAIXO':
      return 'bg-red-100 text-red-800'
  }
}
