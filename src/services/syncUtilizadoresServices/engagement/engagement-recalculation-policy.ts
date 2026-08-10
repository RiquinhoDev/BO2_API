import type { EngagementMetricsResult } from '../universalSync/engagement/engagementMetrics'

type DateValue = Date | string | number

export interface RecalculationUser {
  hotmart?: { lastAccessDate?: DateValue | null }
  curseduca?: {
    lastLogin?: DateValue | null
    lastAction?: DateValue | null
  }
}

export interface RecalculationProduct {
  platform: string
}

export interface CurrentEngagement {
  daysSinceLastLogin?: number | null
  daysSinceLastAction?: number | null
  daysSinceEnrollment?: number | null
  enrolledAt?: DateValue | null
  actionsLastWeek?: number
  actionsLastMonth?: number
}

export interface RecalculationUserProduct {
  engagement?: CurrentEngagement | null
}

interface RecalculationDecisionInput {
  userProduct: RecalculationUserProduct
  user: RecalculationUser
  product: RecalculationProduct
  now: Date
}

type CalculatedEngagement = EngagementMetricsResult['engagement']
export type EngagementUpdate = Record<string, number | Date>

const MS_PER_DAY = 1000 * 60 * 60 * 24

const daysSince = (value: DateValue | null | undefined, now: Date): number | null => {
  if (!value) return null
  return Math.floor((now.getTime() - new Date(value).getTime()) / MS_PER_DAY)
}

export function needsEngagementRecalculation({
  userProduct,
  user,
  product,
  now,
}: RecalculationDecisionInput): boolean {
  const current = userProduct.engagement
  if (!current) return true

  const expectedLastLogin = product.platform === 'hotmart'
    ? daysSince(user.hotmart?.lastAccessDate, now)
    : product.platform === 'curseduca'
      ? daysSince(user.curseduca?.lastLogin, now)
      : null

  if (current.daysSinceLastLogin !== expectedLastLogin) return true

  const expectedLastAction = product.platform === 'curseduca'
    ? daysSince(user.curseduca?.lastAction, now)
    : null

  if (current.daysSinceLastAction !== expectedLastAction) return true

  return current.daysSinceEnrollment !== daysSince(current.enrolledAt, now)
}

const assignChangedNumber = (
  update: EngagementUpdate,
  field: string,
  current: number | null | undefined,
  calculated: number | null | undefined,
): void => {
  if (calculated !== null && calculated !== undefined && current !== calculated) {
    update[`engagement.${field}`] = calculated
  }
}

export function buildEngagementUpdate({
  current,
  calculated,
}: {
  current: CurrentEngagement | null | undefined
  calculated: CalculatedEngagement
}): EngagementUpdate {
  const update: EngagementUpdate = {}

  assignChangedNumber(update, 'daysSinceLastLogin', current?.daysSinceLastLogin, calculated.daysSinceLastLogin)
  assignChangedNumber(update, 'daysSinceLastAction', current?.daysSinceLastAction, calculated.daysSinceLastAction)
  assignChangedNumber(update, 'daysSinceEnrollment', current?.daysSinceEnrollment, calculated.daysSinceEnrollment)
  assignChangedNumber(update, 'actionsLastWeek', current?.actionsLastWeek, calculated.actionsLastWeek)
  assignChangedNumber(update, 'actionsLastMonth', current?.actionsLastMonth, calculated.actionsLastMonth)

  if (calculated.enrolledAt !== null) {
    const currentTime = current?.enrolledAt ? new Date(current.enrolledAt).getTime() : 0
    if (currentTime !== calculated.enrolledAt.getTime()) {
      update['engagement.enrolledAt'] = calculated.enrolledAt
    }
  }

  return update
}
