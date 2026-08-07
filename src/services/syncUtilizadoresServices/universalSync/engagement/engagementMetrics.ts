import type { IUser } from '../../../../models/user'
import type { IProduct } from '../../../../models/product/Product'

export interface Clock {
  now(): Date
}

export interface EngagementMetricsResult {
  engagement: {
    daysSinceLastLogin: number | null
    daysSinceLastAction: number | null
    daysSinceEnrollment: number | null
    enrolledAt: Date | null
    totalLogins?: number
    actionsLastWeek?: number
    actionsLastMonth?: number
    daysInactive?: number
    loginsLast30Days?: number
    weeksActiveLast30Days?: number
  }
  metadata: {
    purchaseValue: number | null
    purchaseDate: Date | null
    platform: string
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Pure engagement-metrics calculation per platform (hotmart login-based,
 * curseduca action-based, discord not implemented). The reference instant is
 * injected so the day deltas and heuristics are deterministic under test.
 */
export function calculateEngagementMetrics(
  user: IUser,
  product: IProduct,
  clock: Clock,
): EngagementMetricsResult {
  const platform = product.platform
  const now = clock.now().getTime()

  let daysSinceLastLogin: number | null = null
  let daysSinceLastAction: number | null = null
  let daysSinceEnrollment: number | null = null
  let enrolledAt: Date | null = null
  let totalLogins = 0
  let actionsLastWeek = 0
  let actionsLastMonth = 0

  if (platform === 'hotmart') {
    const lastLogin =
      user.hotmart?.lastAccessDate ||
      user.hotmart?.progress?.lastAccessDate ||
      user.hotmart?.firstAccessDate

    if (lastLogin) {
      const lastLoginTime = lastLogin instanceof Date ? lastLogin.getTime() : new Date(lastLogin).getTime()
      daysSinceLastLogin = Math.floor((now - lastLoginTime) / MS_PER_DAY)
    }

    totalLogins = user.hotmart?.engagement?.accessCount || 0
  } else if (platform === 'curseduca') {
    const lastAction = user.curseduca?.lastAccess || user.curseduca?.joinedDate

    if (lastAction) {
      const lastActionTime = lastAction instanceof Date ? lastAction.getTime() : new Date(lastAction).getTime()
      daysSinceLastAction = Math.floor((now - lastActionTime) / MS_PER_DAY)
    }

    actionsLastWeek = 0
    actionsLastMonth = 0

    const enrollmentDate =
      user.curseduca?.enrolledClasses?.[0]?.enteredAt ||
      user.curseduca?.joinedDate ||
      user.metadata?.createdAt

    if (enrollmentDate) {
      enrolledAt = enrollmentDate instanceof Date ? enrollmentDate : new Date(enrollmentDate)
      daysSinceEnrollment = Math.floor((now - enrolledAt.getTime()) / MS_PER_DAY)
    }
  }

  let purchaseValue: number | null = null
  let purchaseDate: Date | null = null

  if (platform === 'hotmart') {
    purchaseValue = null
    purchaseDate = user.hotmart?.purchaseDate || user.hotmart?.firstAccessDate || user.metadata?.createdAt || null
  } else if (platform === 'curseduca') {
    purchaseValue = null
    purchaseDate = user.curseduca?.joinedDate || user.metadata?.createdAt || null
  } else if (platform === 'discord') {
    purchaseValue = null
    purchaseDate = user.discord?.createdAt || user.metadata?.createdAt || null
  }

  // Tag System V2 derived fields.
  let daysInactive: number | undefined
  if (platform === 'hotmart' && daysSinceLastLogin !== null) {
    daysInactive = daysSinceLastLogin
  } else if (platform === 'curseduca' && daysSinceLastAction !== null) {
    daysInactive = daysSinceLastAction
  }

  let loginsLast30Days: number | undefined
  if (platform === 'hotmart') {
    loginsLast30Days =
      daysSinceLastLogin !== null && daysSinceLastLogin < 30
        ? Math.max(1, Math.floor((30 - daysSinceLastLogin) / 3))
        : 0
  } else if (platform === 'curseduca') {
    loginsLast30Days =
      daysSinceLastAction !== null && daysSinceLastAction < 30
        ? Math.max(1, Math.floor((30 - daysSinceLastAction) / 5))
        : 0
  }

  let weeksActiveLast30Days: number | undefined
  if (daysInactive !== undefined) {
    if (daysInactive === 0) weeksActiveLast30Days = 4
    else if (daysInactive < 7) weeksActiveLast30Days = 4
    else if (daysInactive < 14) weeksActiveLast30Days = 3
    else if (daysInactive < 21) weeksActiveLast30Days = 2
    else if (daysInactive < 30) weeksActiveLast30Days = 1
    else weeksActiveLast30Days = 0
  }

  return {
    engagement: {
      daysSinceLastLogin,
      daysSinceLastAction,
      daysSinceEnrollment,
      enrolledAt,
      totalLogins,
      actionsLastWeek,
      actionsLastMonth,
      daysInactive,
      loginsLast30Days,
      weeksActiveLast30Days,
    },
    metadata: {
      purchaseValue,
      purchaseDate,
      platform,
    },
  }
}

/** Contract wrapper used by the sync pipeline and the recalculate job. */
export function calculateEngagementMetricsForUserProduct(user: IUser, product: IProduct): EngagementMetricsResult {
  return calculateEngagementMetrics(user, product, { now: () => new Date() })
}
