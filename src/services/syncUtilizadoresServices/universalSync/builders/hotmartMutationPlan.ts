import type { UniversalSourceItem } from '../../../../types/universalSync.types'
import { toDateOrNull, toNumber } from '../fieldUtils'

export interface Clock {
  now(): Date
}

// Plain-data class shapes — the builder is decoupled from the Mongoose models.
export interface HotmartClassEnrollment {
  classId?: string
  className?: string
  source: string
  isActive?: boolean
  enrolledAt?: Date | null
}

export interface CurseducaClassEnrollment {
  classId?: string
  className?: string
  isActive?: boolean
  enteredAt?: Date | null
  role?: string
}

export interface CombinedClassEntry {
  classId?: string
  className?: string
  source: string
  isActive?: boolean
  enrolledAt?: Date | null
  role?: string
}

/** Plain-data slice of the current user the builder needs (no Mongoose doc). */
export interface HotmartUserState {
  classId?: string
  hotmart?: { enrolledClasses?: HotmartClassEnrollment[] }
  curseduca?: { enrolledClasses?: CurseducaClassEnrollment[] }
}

export interface HotmartMutationInput {
  item: UniversalSourceItem
  user: HotmartUserState
  isNew: boolean
  /** Real class name resolved by ensureClassExists (prepare phase); null when the item carries no classId. */
  realClassName: string | null
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
    lastSyncAt: Date
    syncVersion: string
  }
  combined: {
    allClasses: CombinedClassEntry[]
    primaryClass?: { classId?: string; className?: string; source: string }
    classId?: string
    className?: string
  }
  metadata: {
    updatedAt: Date
    sources: { hotmart: { lastSync: Date; version: string } }
  }
  classHistoryEvent?: ClassHistoryEvent
}

/**
 * Pure builder for the hotmart branch mutation plan. No Mongoose, no models, no
 * I/O — it consumes the item, the current user state, and a resolved real class
 * name, and returns an explicit plan. The clock is injected and used at the same
 * logical points as the original branch.
 */
export function buildHotmartMutationPlan(input: HotmartMutationInput): HotmartMutationPlan {
  const { item, user, isNew, realClassName, clock } = input

  const purchaseDate = toDateOrNull(item.purchaseDate)
  const signupDate = toDateOrNull(item.signupDate)
  const firstAccessDate = toDateOrNull(item.firstAccessDate)
  const lastAccessDate = toDateOrNull(item.lastAccessDate)

  const plan: HotmartMutationPlan = {
    needsUpdate: false,
    hotmart: {
      lastSyncAt: clock.now(),
      syncVersion: '3.0',
    },
    combined: { allClasses: [] },
    metadata: {
      updatedAt: clock.now(),
      sources: { hotmart: { lastSync: clock.now(), version: '3.0' } },
    },
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

  if (!item.classId) {
    const existingActiveClass = user.hotmart?.enrolledClasses?.find((c) => c.isActive)
    if (existingActiveClass && user.classId !== existingActiveClass.classId) {
      plan.rootClassId = existingActiveClass.classId
      plan.rootClassName = existingActiveClass.className
      plan.needsUpdate = true
    }
  }

  if (item.classId) {
    const oldClassId = user.hotmart?.enrolledClasses?.[0]?.classId
    const oldClassName = user.hotmart?.enrolledClasses?.[0]?.className
    const hasClassChanged = Boolean(oldClassId && oldClassId !== item.classId)

    pendingHotmartClasses = [
      {
        classId: item.classId,
        className: realClassName ?? undefined,
        source: 'hotmart',
        isActive: true,
        enrolledAt: purchaseDate || clock.now(),
      },
    ]
    plan.hotmart.enrolledClasses = pendingHotmartClasses
    plan.rootClassId = item.classId
    plan.rootClassName = realClassName ?? undefined
    plan.needsUpdate = true

    if (hasClassChanged) {
      plan.classHistoryEvent = {
        type: 'class-changed',
        classId: item.classId,
        className: item.className || `Turma ${item.classId}`,
        previousClassId: oldClassId,
        previousClassName: oldClassName,
        dateMoved: clock.now(),
      }
    } else if (!oldClassId && !isNew) {
      plan.classHistoryEvent = {
        type: 'first-enrollment',
        classId: item.classId,
        className: item.className || `Turma ${item.classId}`,
        dateMoved: purchaseDate || clock.now(),
      }
    }
  }

  const allClasses: CombinedClassEntry[] = []
  if (pendingHotmartClasses) {
    pendingHotmartClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'hotmart', isActive: cls.isActive ?? true, enrolledAt: cls.enrolledAt })
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

/** Pure flatten of the plan into the exact dotted Mongo paths the branch wrote. */
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

  fields['hotmart.lastSyncAt'] = plan.hotmart.lastSyncAt
  fields['hotmart.syncVersion'] = plan.hotmart.syncVersion
  fields['metadata.updatedAt'] = plan.metadata.updatedAt
  fields['metadata.sources.hotmart.lastSync'] = plan.metadata.sources.hotmart.lastSync
  fields['metadata.sources.hotmart.version'] = plan.metadata.sources.hotmart.version

  return fields
}
