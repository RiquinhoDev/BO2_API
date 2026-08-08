import type { UniversalSourceItem } from '../../../../types/universalSync.types'
import { toDateOrNull, toNumber } from '../fieldUtils'

export interface Clock {
  now(): Date
}

export type ClassRole = 'student' | 'assistant' | 'teacher'

// Loose shapes for READING the current user's existing enrollments.
export interface HotmartUserEnrollment {
  classId?: string
  className?: string
  isActive?: boolean
  enrolledAt?: Date | null
}

export interface CurseducaUserEnrollment {
  classId?: string
  className?: string
  isActive?: boolean
  enteredAt?: Date | null
  role?: ClassRole
}

// Strict shape for a newly-resolved hotmart enrollment the plan WRITES.
export interface HotmartClassEnrollment {
  classId: string
  className: string
  source: 'hotmart'
  isActive: boolean
  enrolledAt: Date | null
}

export interface CombinedClassEntry {
  classId?: string
  className?: string
  source: 'hotmart' | 'curseduca'
  isActive?: boolean
  enrolledAt?: Date | null
  role?: ClassRole
}

/** Plain-data slice of the current user the builder needs (no Mongoose doc). */
export interface HotmartUserState {
  classId?: string
  hotmart?: { enrolledClasses?: HotmartUserEnrollment[] }
  curseduca?: { enrolledClasses?: CurseducaUserEnrollment[] }
}

export interface HotmartMutationInput {
  item: UniversalSourceItem
  user: HotmartUserState
  isNew: boolean
  /** The class resolved by ensureClassExists (prepare phase); undefined when the item carries no classId. */
  resolvedClass?: { classId: string; className: string }
  clock: Clock
}

export interface HotmartEngagementPlan {
  accessCount?: number
  engagementScore?: number
  engagementLevel?: string
  calculatedAt?: Date
}

export interface ClassHistoryEvent {
  type: 'first-enrollment' | 'class-changed'
  classId: string
  className: string
  previousClassId?: string
  previousClassName?: string
  dateMoved: Date
}

export interface HotmartMutationPlan {
  needsUpdate: boolean
  rootClassId?: string
  rootClassName?: string
  rootAccessCount?: number
  hotmart: {
    hotmartUserId?: string
    purchaseDate?: Date
    signupDate?: Date
    firstAccessDate?: Date
    lastAccessDate?: Date
    plusAccess?: string
    enrolledClasses?: HotmartClassEnrollment[]
    engagement?: HotmartEngagementPlan
    syncVersion: string
  }
  combined: {
    allClasses: CombinedClassEntry[]
    primaryClass?: { classId?: string; className?: string; source: 'hotmart' | 'curseduca' }
    classId?: string
    className?: string
  }
  metadata: {
    sources: { hotmart: { version: string } }
  }
  classHistoryEvent?: ClassHistoryEvent
}

/**
 * Pure builder for the hotmart branch mutation plan. No Mongoose, no models, no
 * I/O — it consumes the item, the current user state, and a resolved class, and
 * returns an explicit plan. The clock is injected. Sync timestamps
 * (hotmart.lastSyncAt / metadata.updatedAt / sources.lastSync) are NOT here:
 * they are stamped by the executor AFTER the history effect, preserving the
 * original temporal order.
 */
export function buildHotmartMutationPlan(input: HotmartMutationInput): HotmartMutationPlan {
  const { item, user, isNew, resolvedClass, clock } = input

  const purchaseDate = toDateOrNull(item.purchaseDate)
  const signupDate = toDateOrNull(item.signupDate)
  const firstAccessDate = toDateOrNull(item.firstAccessDate)
  const lastAccessDate = toDateOrNull(item.lastAccessDate)

  const plan: HotmartMutationPlan = {
    needsUpdate: false,
    hotmart: { syncVersion: '3.0' },
    combined: { allClasses: [] },
    metadata: { sources: { hotmart: { version: '3.0' } } },
  }

  if (item.hotmartUserId) {
    plan.hotmart.hotmartUserId = item.hotmartUserId
    plan.needsUpdate = true
  }

  if (purchaseDate) { plan.hotmart.purchaseDate = purchaseDate; plan.needsUpdate = true }
  if (signupDate) { plan.hotmart.signupDate = signupDate; plan.needsUpdate = true }
  if (firstAccessDate) { plan.hotmart.firstAccessDate = firstAccessDate; plan.needsUpdate = true }
  if (lastAccessDate) { plan.hotmart.lastAccessDate = lastAccessDate; plan.needsUpdate = true }

  if (item.accessCount !== undefined) {
    const accessCount = toNumber(item.accessCount, 0)
    plan.hotmart.engagement = {
      ...plan.hotmart.engagement,
      accessCount,
      engagementScore: toNumber(item.engagement?.engagementScore ?? accessCount, 0),
      calculatedAt: clock.now(),
    }
    plan.rootAccessCount = accessCount
    plan.needsUpdate = true
  }

  if (item.engagementLevel) {
    plan.hotmart.engagement = {
      ...plan.hotmart.engagement,
      engagementLevel: item.engagementLevel,
      calculatedAt: clock.now(),
    }
    plan.needsUpdate = true
  }

  if (item.plusAccess) { plan.hotmart.plusAccess = item.plusAccess; plan.needsUpdate = true }
  if (lastAccessDate) { plan.hotmart.lastAccessDate = lastAccessDate; plan.needsUpdate = true }

  let pendingHotmartClasses: HotmartClassEnrollment[] | undefined

  if (!resolvedClass) {
    const existingActiveClass = user.hotmart?.enrolledClasses?.find((c) => c.isActive)
    if (existingActiveClass && user.classId !== existingActiveClass.classId) {
      plan.rootClassId = existingActiveClass.classId
      plan.rootClassName = existingActiveClass.className
      plan.needsUpdate = true
    }
  }

  if (resolvedClass) {
    const oldClassId = user.hotmart?.enrolledClasses?.[0]?.classId
    const oldClassName = user.hotmart?.enrolledClasses?.[0]?.className
    const hasClassChanged = Boolean(oldClassId && oldClassId !== resolvedClass.classId)

    pendingHotmartClasses = [
      {
        classId: resolvedClass.classId,
        className: resolvedClass.className,
        source: 'hotmart',
        isActive: true,
        enrolledAt: purchaseDate || clock.now(),
      },
    ]
    plan.hotmart.enrolledClasses = pendingHotmartClasses
    plan.rootClassId = resolvedClass.classId
    plan.rootClassName = resolvedClass.className
    plan.needsUpdate = true

    if (hasClassChanged) {
      plan.classHistoryEvent = {
        type: 'class-changed',
        classId: resolvedClass.classId,
        className: item.className || `Turma ${resolvedClass.classId}`,
        previousClassId: oldClassId,
        previousClassName: oldClassName,
        dateMoved: clock.now(),
      }
    } else if (!oldClassId && !isNew) {
      plan.classHistoryEvent = {
        type: 'first-enrollment',
        classId: resolvedClass.classId,
        className: item.className || `Turma ${resolvedClass.classId}`,
        dateMoved: purchaseDate || clock.now(),
      }
    }
  }

  const allClasses: CombinedClassEntry[] = []
  if (pendingHotmartClasses) {
    pendingHotmartClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'hotmart', isActive: cls.isActive, enrolledAt: cls.enrolledAt })
    })
  } else if (user.hotmart?.enrolledClasses) {
    user.hotmart.enrolledClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'hotmart', isActive: cls.isActive ?? true, enrolledAt: cls.enrolledAt })
    })
  }

  if (user.curseduca?.enrolledClasses) {
    user.curseduca.enrolledClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'curseduca', isActive: cls.isActive ?? true, enrolledAt: cls.enteredAt, role: cls.role })
    })
  }

  plan.combined.allClasses = allClasses

  const hotmartActive = allClasses.find((c) => c.source === 'hotmart' && c.isActive)
  const curseducaActive = allClasses.find((c) => c.source === 'curseduca' && c.isActive)
  const primary = hotmartActive || curseducaActive

  if (primary) {
    plan.combined.primaryClass = { classId: primary.classId, className: primary.className, source: primary.source }
    plan.combined.classId = primary.classId
    plan.combined.className = primary.className
    if (primary.source === 'hotmart') {
      plan.rootClassId = primary.classId
      plan.rootClassName = primary.className
    }
  }

  plan.needsUpdate = true
  return plan
}

/**
 * Pure flatten of the plan into the dotted Mongo paths the branch wrote (minus
 * the sync timestamps, which the executor stamps after the history effect).
 */
export function hotmartPlanToUpdateFields(plan: HotmartMutationPlan): Record<string, unknown> {
  const fields: Record<string, unknown> = {}

  if (plan.hotmart.hotmartUserId !== undefined) fields['hotmart.hotmartUserId'] = plan.hotmart.hotmartUserId
  if (plan.hotmart.purchaseDate !== undefined) fields['hotmart.purchaseDate'] = plan.hotmart.purchaseDate
  if (plan.hotmart.signupDate !== undefined) fields['hotmart.signupDate'] = plan.hotmart.signupDate
  if (plan.hotmart.firstAccessDate !== undefined) fields['hotmart.firstAccessDate'] = plan.hotmart.firstAccessDate
  if (plan.hotmart.lastAccessDate !== undefined) fields['hotmart.lastAccessDate'] = plan.hotmart.lastAccessDate
  if (plan.hotmart.plusAccess !== undefined) fields['hotmart.plusAccess'] = plan.hotmart.plusAccess
  if (plan.hotmart.enrolledClasses !== undefined) fields['hotmart.enrolledClasses'] = plan.hotmart.enrolledClasses

  const eng = plan.hotmart.engagement
  if (eng) {
    if (eng.accessCount !== undefined) fields['hotmart.engagement.accessCount'] = eng.accessCount
    if (eng.engagementScore !== undefined) fields['hotmart.engagement.engagementScore'] = eng.engagementScore
    if (eng.engagementLevel !== undefined) fields['hotmart.engagement.engagementLevel'] = eng.engagementLevel
    if (eng.calculatedAt !== undefined) fields['hotmart.engagement.calculatedAt'] = eng.calculatedAt
  }

  if (plan.rootAccessCount !== undefined) fields['accessCount'] = plan.rootAccessCount
  if (plan.rootClassId !== undefined) fields['classId'] = plan.rootClassId
  if (plan.rootClassName !== undefined) fields['className'] = plan.rootClassName

  fields['combined.allClasses'] = plan.combined.allClasses
  if (plan.combined.primaryClass) fields['combined.primaryClass'] = plan.combined.primaryClass
  if (plan.combined.classId !== undefined) fields['combined.classId'] = plan.combined.classId
  if (plan.combined.className !== undefined) fields['combined.className'] = plan.combined.className

  fields['hotmart.syncVersion'] = plan.hotmart.syncVersion
  fields['metadata.sources.hotmart.version'] = plan.metadata.sources.hotmart.version

  return fields
}
