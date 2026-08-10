import type mongoose from 'mongoose'
import type { UniversalSourceItem, UniversalSyncType } from '../../../../types/universalSync.types'
import type { IClassEnrollment, IEngagement, IProgress, IUserProduct } from '../../../../models/UserProduct'
import type { Clock, EngagementMetricsResult } from '../engagement/engagementMetrics'
import { planClassEnrollmentRole } from '../../classEnrollmentRole'
import { toDateOrNull, toNumber } from '../fieldUtils'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** The shape passed to UserProduct.create for a brand-new enrolment. */
export interface NewUserProductInput {
  userId: string
  productId: mongoose.Types.ObjectId
  platform: IUserProduct['platform']
  platformUserId: string
  platformUserUuid?: string
  status: IUserProduct['status']
  source: IUserProduct['source']
  enrolledAt: Date
  isPrimary: boolean
  progress: IProgress
  engagement: IEngagement
  platformData?: Record<string, unknown>
  classes: IClassEnrollment[]
  metadata?: IUserProduct['metadata']
}

/** Current UserProduct state the update builder needs to decide diffs. */
export interface UserProductUpdateExisting {
  progressPercentage?: number
  engagementScore?: number
  classes: IClassEnrollment[]
}

export interface UserProductUpdateInput {
  item: UniversalSourceItem
  syncType: UniversalSyncType
  existing: UserProductUpdateExisting
  /** Precomputed by the caller (Product.findById + calculateEngagementMetrics); null when unavailable. */
  metrics: EngagementMetricsResult | null
  clock: Clock
}

export interface UserProductUpdatePlan {
  fields: Record<string, unknown>
  needsUpdate: boolean
  /** classId that was newly appended to the classes array — the executor logs it. */
  classAddedId?: string
}

/**
 * Pure builder for the "update existing UserProduct" branch of processSyncItem.
 * item + current UP state + precomputed metrics -> the exact $set field map,
 * preserving the original order (so metrics overwrites the platform engagement
 * fields exactly as before). No Mongoose, no models, no I/O, no logging.
 */
export function buildUserProductUpdatePlan(input: UserProductUpdateInput): UserProductUpdatePlan {
  const { item, syncType, existing, metrics, clock } = input
  const fields: Record<string, unknown> = {}
  let needsUpdate = false
  let classAddedId: string | undefined

  // isPrimary
  if (item.platformData?.isPrimary !== undefined) {
    fields['isPrimary'] = item.platformData.isPrimary
    needsUpdate = true
  }

  // progress.percentage — only when it differs
  if (item.progress?.percentage !== undefined) {
    const newPercentage = toNumber(item.progress.percentage, 0)
    if (existing.progressPercentage !== newPercentage) {
      fields['progress.percentage'] = newPercentage
      fields['progress.lastActivity'] = toDateOrNull(item.lastAccessDate || item.lastLogin) || clock.now()
      needsUpdate = true
    }
  }

  // Hotmart-specific progress
  if (syncType === 'hotmart') {
    if (item.currentModule !== undefined) {
      fields['progress.currentModule'] = toNumber(item.currentModule, 0)
      needsUpdate = true
    }
    if (item.progress?.completed !== undefined) {
      fields['progress.completed'] = toNumber(item.progress.completed, 0)
      needsUpdate = true
    }
    if (item.progress?.total !== undefined) {
      fields['progress.total'] = toNumber(item.progress.total, 0)
      needsUpdate = true
    }
    if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
      const completedLessons = item.progress.lessons.flatMap((l) => (l.isCompleted && l.pageId ? [l.pageId] : []))
      if (completedLessons.length > 0) {
        fields['progress.lessonsCompleted'] = completedLessons
        needsUpdate = true
      }
    }
    if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
      const completedModules = [...new Set(item.progress.lessons.flatMap((l) => (l.isCompleted && l.moduleName ? [l.moduleName] : [])))]
      if (completedModules.length > 0) {
        fields['progress.modulesCompleted'] = completedModules
        needsUpdate = true
      }
    }
    if (item.progress?.modulesList && Array.isArray(item.progress.modulesList)) {
      fields['progress.modulesList'] = item.progress.modulesList
      needsUpdate = true
    }
    if (item.progress?.totalModules !== undefined) {
      fields['progress.totalModules'] = toNumber(item.progress.totalModules, 0)
      needsUpdate = true
    }
  }

  // Engagement score + basic fields — only when it differs
  if (item.engagement?.engagementScore !== undefined) {
    const newScore = toNumber(item.engagement.engagementScore, 0)
    if (existing.engagementScore !== newScore) {
      applyEngagementScore(fields, newScore, item, clock)
      needsUpdate = true
    }
  } else if (item.accessCount !== undefined) {
    const newScore = toNumber(item.accessCount, 0)
    if (existing.engagementScore !== newScore) {
      applyEngagementScore(fields, newScore, item, clock)
      needsUpdate = true
    }
  }

  // Hotmart engagement based on logins
  if (syncType === 'hotmart') {
    if (item.accessCount !== undefined) {
      fields['engagement.totalLogins'] = toNumber(item.accessCount, 0)
      needsUpdate = true
    }
    if (item.lastAccessDate) {
      fields['engagement.lastLogin'] = toDateOrNull(item.lastAccessDate)
      needsUpdate = true
    }
  }

  // CursEduca engagement based on actions
  if (syncType === 'curseduca') {
    if (item.lastLogin) {
      const lastActionDate = toDateOrNull(item.lastLogin)
      fields['engagement.lastAction'] = lastActionDate
      if (lastActionDate) {
        const daysInactive = Math.floor((clock.now().getTime() - lastActionDate.getTime()) / MS_PER_DAY)
        fields['engagement.daysInactive'] = Math.max(0, daysInactive)
      }
      needsUpdate = true
    }
    if (item.accessCount !== undefined) {
      fields['engagement.totalLogins'] = toNumber(item.accessCount, 0)
      needsUpdate = true
    }
  }

  if (item.platformData) {
    fields['platformData'] = item.platformData
    needsUpdate = true
  }

  // Classes — populate the enrolment array
  const classId = classIdFor(syncType, item)
  if (classId) {
    const enrollmentDate =
      toDateOrNull(item.enrolledAt) || toDateOrNull(item.purchaseDate) || toDateOrNull(item.joinedDate) || clock.now()
    const rolePlan = planClassEnrollmentRole(existing.classes, classId, item.role)
    const existingClassIndex = existing.classes.findIndex((c) => c.classId === classId)

    if (existingClassIndex === -1) {
      fields['classes'] = [...existing.classes, { classId, role: rolePlan.role, joinedAt: enrollmentDate, leftAt: null }]
      needsUpdate = true
      classAddedId = classId
    } else if (rolePlan.update) {
      fields[rolePlan.update.path] = rolePlan.update.value
      needsUpdate = true
    }
  }

  // Sprint 1.5B engagement metrics (precomputed) — overwrites platform fields, as before
  if (metrics) {
    if (metrics.engagement.daysSinceLastLogin !== null) {
      fields['engagement.daysSinceLastLogin'] = metrics.engagement.daysSinceLastLogin
      needsUpdate = true
    }
    if (metrics.engagement.daysSinceLastAction !== null) {
      fields['engagement.daysSinceLastAction'] = metrics.engagement.daysSinceLastAction
      needsUpdate = true
    }
    if (metrics.engagement.totalLogins !== undefined) {
      fields['engagement.totalLogins'] = metrics.engagement.totalLogins
      needsUpdate = true
    }
    if (metrics.metadata.purchaseDate !== null) {
      fields['metadata.purchaseDate'] = metrics.metadata.purchaseDate
      needsUpdate = true
    }
    if (metrics.metadata.platform) {
      fields['metadata.platform'] = metrics.metadata.platform
      needsUpdate = true
    }
    if (metrics.metadata.purchaseValue !== null) {
      fields['metadata.purchaseValue'] = metrics.metadata.purchaseValue
      needsUpdate = true
    }
  }

  return { fields, needsUpdate, classAddedId }
}

function applyEngagementScore(
  fields: Record<string, unknown>,
  newScore: number,
  item: UniversalSourceItem,
  clock: Clock,
): void {
  fields['engagement.engagementScore'] = newScore
  const lastActionDate = toDateOrNull(item.lastAccessDate || item.lastLogin) || clock.now()
  fields['engagement.lastAction'] = lastActionDate
  const daysInactive = Math.floor((clock.now().getTime() - lastActionDate.getTime()) / MS_PER_DAY)
  fields['engagement.daysInactive'] = Math.max(0, daysInactive)
}

/** The classId used for the enrolment array: item.classId (hotmart) or the group id (curseduca). */
export function classIdFor(syncType: UniversalSyncType, item: UniversalSourceItem): string | null {
  if (syncType === 'hotmart') return item.classId ?? null
  // A missing groupId must NOT become the string "undefined" (phantom enrolment).
  if (syncType === 'curseduca') return item.groupId == null ? null : String(item.groupId)
  return null
}

export interface PrimaryReassignmentExisting {
  enrolledAt?: Date | null
  status: string
}

export interface PrimaryReassignmentPlan {
  /** isPrimary the new UserProduct should carry. */
  newIsPrimary: boolean
  /** $set to demote (and possibly inactivate) the incumbent primary; absent when the new one stays secondary. */
  demoteUpdate?: Record<string, unknown>
}

/**
 * Pure decision for the curseduca "one primary" rule when a new primary product
 * is synced: if the new enrolment is more recent, the incumbent is demoted (and
 * inactivated only if it was ACTIVE/PARA_INATIVAR); otherwise the new one
 * becomes secondary and the incumbent is left untouched.
 */
export function planPrimaryReassignment(
  existing: PrimaryReassignmentExisting,
  newEnrolledAt: Date,
  clock: Clock,
): PrimaryReassignmentPlan {
  const existingDate = existing.enrolledAt ? new Date(existing.enrolledAt).getTime() : 0
  const newDate = newEnrolledAt.getTime()

  if (newDate > existingDate) {
    const demoteUpdate: Record<string, unknown> = { isPrimary: false }
    // Só inativar se ainda estiver ACTIVE ou PARA_INATIVAR — não tocar em já INACTIVE.
    if (['ACTIVE', 'PARA_INATIVAR'].includes(existing.status)) {
      demoteUpdate['status'] = 'INACTIVE'
      demoteUpdate['metadata.inactivatedAt'] = clock.now()
      demoteUpdate['metadata.inactivatedReason'] = 'Substituído por novo plano no sync (mudança de plano)'
    }
    return { newIsPrimary: true, demoteUpdate }
  }

  return { newIsPrimary: false }
}

export interface UserProductCreateInput {
  item: UniversalSourceItem
  syncType: UniversalSyncType
  userId: string
  productId: mongoose.Types.ObjectId
  enrolledAt: Date
  isPrimary: boolean
  /** Precomputed by the caller (Product.findById + calculateEngagementMetrics); null when unavailable. */
  metrics: EngagementMetricsResult | null
  clock: Clock
}

/**
 * Pure builder for the "create new UserProduct" branch. item + resolved
 * ids/dates/primary + precomputed metrics -> the exact NewUserProductInput,
 * including the Sprint-1.5B metrics merge (which overwrites totalLogins with
 * `metrics.totalLogins || 0`, preserved as-is). No Mongoose, models, I/O or logs.
 */
export function buildUserProductCreatePlan(input: UserProductCreateInput): NewUserProductInput {
  const { item, syncType, userId, productId, enrolledAt, isPrimary, metrics, clock } = input

  const classId = classIdFor(syncType, item)
  const role = classId
    ? planClassEnrollmentRole([], classId, item.role).role
    : undefined

  // Não guardamos className no UserProduct — vem da tabela Class via lookup.
  const classesArray: IClassEnrollment[] = classId
    ? [{ classId, role, joinedAt: enrolledAt }]
    : []

  const progressObj: IProgress = {
    percentage: item.progress?.percentage ? toNumber(item.progress.percentage, 0) : 0,
    lastActivity: toDateOrNull(item.lastAccessDate || item.lastLogin) || clock.now(),
  }

  if (syncType === 'hotmart') {
    if (item.currentModule !== undefined) progressObj.currentModule = toNumber(item.currentModule, 0)
    if (item.progress?.completed !== undefined) progressObj.completed = toNumber(item.progress.completed, 0)
    if (item.progress?.total !== undefined) progressObj.total = toNumber(item.progress.total, 0)
    if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
      progressObj.lessonsCompleted = item.progress.lessons.flatMap((l) => (l.isCompleted && l.pageId ? [l.pageId] : []))
    }
    if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
      progressObj.modulesCompleted = [...new Set(item.progress.lessons.flatMap((l) => (l.isCompleted && l.moduleName ? [l.moduleName] : [])))]
    }
  }

  const lastActionDate = toDateOrNull(item.lastAccessDate || item.lastLogin) || clock.now()
  const now = clock.now()
  const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / MS_PER_DAY)

  const engagementObj: IEngagement = {
    engagementScore: item.engagement?.engagementScore ? toNumber(item.engagement.engagementScore, 0) : toNumber(item.accessCount, 0),
    lastAction: lastActionDate,
    daysInactive: Math.max(0, daysInactive),
  }

  if (syncType === 'hotmart') {
    if (item.accessCount !== undefined) engagementObj.totalLogins = toNumber(item.accessCount, 0)
    if (item.lastAccessDate) engagementObj.lastLogin = toDateOrNull(item.lastAccessDate) || undefined
  }

  if (syncType === 'curseduca') {
    if (item.lastLogin) {
      const curseducaLastAction = toDateOrNull(item.lastLogin)
      engagementObj.lastAction = curseducaLastAction || undefined
      if (curseducaLastAction) {
        const curseducaDaysInactive = Math.floor((now.getTime() - curseducaLastAction.getTime()) / MS_PER_DAY)
        engagementObj.daysInactive = Math.max(0, curseducaDaysInactive)
      }
    }
    if (item.accessCount !== undefined) engagementObj.totalLogins = toNumber(item.accessCount, 0)
  }

  const newUserProduct: NewUserProductInput = {
    userId,
    productId,
    platform: syncType,
    platformUserId: item.curseducaUserId || item.hotmartUserId || userId,
    platformUserUuid: item.curseducaUuid, // Só Curseduca
    status: 'ACTIVE',
    source: 'PURCHASE',
    enrolledAt,
    isPrimary,
    progress: progressObj,
    engagement: engagementObj,
    platformData: item.platformData,
    classes: classesArray,
  }

  if (metrics) {
    newUserProduct.engagement = {
      ...newUserProduct.engagement,
      ...(metrics.engagement.daysSinceLastLogin !== null && { daysSinceLastLogin: metrics.engagement.daysSinceLastLogin }),
      ...(metrics.engagement.daysSinceLastAction !== null && { daysSinceLastAction: metrics.engagement.daysSinceLastAction }),
      totalLogins: metrics.engagement.totalLogins || 0,
    }

    newUserProduct.metadata = {
      ...(newUserProduct.metadata ?? {}),
      ...(metrics.metadata.purchaseDate !== null && { purchaseDate: metrics.metadata.purchaseDate }),
      platform: metrics.metadata.platform,
      ...(metrics.metadata.purchaseValue !== null && { purchaseValue: metrics.metadata.purchaseValue }),
    }
  }

  return newUserProduct
}
