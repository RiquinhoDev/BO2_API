import type { UniversalSourceItem } from '../../../../types/universalSync.types'
import {
  buildCurseducaEnrollment,
  isCurseducaEnrollmentActive,
  type CurseducaEnrollmentRecord,
} from '../../curseducaServices/curseducaMemberships'
import { toDateOrNull, toNumber } from '../fieldUtils'
import type {
  Clock,
  CombinedClassEntry,
  CurseducaUserEnrollment,
  HotmartUserEnrollment,
} from './hotmartMutationPlan'

export interface CurseducaUserState {
  hotmart?: { enrolledClasses?: HotmartUserEnrollment[] }
  curseduca?: { curseducaUserId?: string; enrolledClasses?: CurseducaUserEnrollment[] }
}

export interface CurseducaMutationInput {
  item: UniversalSourceItem
  user: CurseducaUserState
  clock: Clock
}

export interface CurseducaMutationPlan {
  needsUpdate: boolean
  rootClassId?: string
  rootClassName?: string
  /** True when the member is inactive on CursEduca — the executor then flips a PARA_INATIVAR userproduct. */
  reconcileParaInativar: boolean
  curseduca: {
    curseducaUserId?: string
    curseducaUuid?: string
    enrollmentsCount?: number
    groupId?: string
    groupName?: string
    enrolledClasses?: CurseducaEnrollmentRecord[]
    subscriptionType?: string
    situation?: string
    memberStatus: 'ACTIVE' | 'INACTIVE'
    lastAccess?: Date
    lastLogin?: Date
    joinedDate?: Date
    progressEstimated?: number
    syncVersion: string
  }
  combined: {
    allClasses: CombinedClassEntry[]
    primaryClass?: { classId?: string; className?: string; source: 'hotmart' | 'curseduca' }
    classId?: string
    className?: string
  }
  metadata: { sources: { curseduca: { version: string } } }
}

/**
 * Pure builder for the curseduca branch. No Mongoose, no models, no I/O — reuses
 * the canonical buildCurseducaEnrollment / isCurseducaEnrollmentActive helpers.
 * Sync timestamps and the PARA_INATIVAR reconcile are NOT here: they are the
 * executor's job, preserving the original order.
 */
export function buildCurseducaMutationPlan(input: CurseducaMutationInput): CurseducaMutationPlan {
  const { item, user } = input

  const situation = item.platformData?.situation || 'ACTIVE'

  const plan: CurseducaMutationPlan = {
    needsUpdate: false,
    reconcileParaInativar: !isCurseducaEnrollmentActive(situation),
    curseduca: {
      memberStatus: isCurseducaEnrollmentActive(situation) ? 'ACTIVE' : 'INACTIVE',
      syncVersion: '3.1',
    },
    combined: { allClasses: [] },
    metadata: { sources: { curseduca: { version: '3.1' } } },
  }

  if (item.curseducaUserId && item.curseducaUserId !== user.curseduca?.curseducaUserId) {
    plan.curseduca.curseducaUserId = item.curseducaUserId
    plan.needsUpdate = true
  }
  if (item.curseducaUuid) { plan.curseduca.curseducaUuid = item.curseducaUuid; plan.needsUpdate = true }
  if (item.platformData?.enrollmentsCount !== undefined) {
    plan.curseduca.enrollmentsCount = item.platformData.enrollmentsCount
    plan.needsUpdate = true
  }
  if (item.groupId) { plan.curseduca.groupId = String(item.groupId); plan.needsUpdate = true }
  if (item.groupName) { plan.curseduca.groupName = item.groupName; plan.needsUpdate = true }

  let pendingCurseducaClasses: CurseducaEnrollmentRecord[] | undefined
  const allCurseducaGroups = item.allCurseducaGroups

  if (allCurseducaGroups && Array.isArray(allCurseducaGroups) && allCurseducaGroups.length > 0) {
    pendingCurseducaClasses = allCurseducaGroups.map((group) => buildCurseducaEnrollment(group))
    plan.curseduca.enrolledClasses = pendingCurseducaClasses
    plan.needsUpdate = true
  } else if (item.groupId) {
    pendingCurseducaClasses = [
      buildCurseducaEnrollment({
        groupId: item.groupId,
        groupName: item.groupName,
        enrolledAt: item.enrolledAt,
        expiresAt: item.expiresAt,
        role: 'student',
        situation: item.platformData?.situation,
      }),
    ]
    plan.curseduca.enrolledClasses = pendingCurseducaClasses
    plan.needsUpdate = true
  }

  if (item.subscriptionType) { plan.curseduca.subscriptionType = item.subscriptionType; plan.needsUpdate = true }
  if (item.platformData?.situation) { plan.curseduca.situation = item.platformData.situation; plan.needsUpdate = true }
  plan.needsUpdate = true

  const lastAccess = toDateOrNull(item.lastAccess)
  if (lastAccess) { plan.curseduca.lastAccess = lastAccess; plan.needsUpdate = true }
  const lastLogin = toDateOrNull(item.lastLogin)
  if (lastLogin) { plan.curseduca.lastLogin = lastLogin; plan.needsUpdate = true }
  const enrolledAt = toDateOrNull(item.enrolledAt)
  if (enrolledAt) { plan.curseduca.joinedDate = enrolledAt; plan.needsUpdate = true }

  if (item.progress?.percentage !== undefined) {
    plan.curseduca.progressEstimated = toNumber(item.progress.percentage, 0)
    plan.needsUpdate = true
  }

  const allClasses: CombinedClassEntry[] = []
  if (user.hotmart?.enrolledClasses) {
    user.hotmart.enrolledClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'hotmart', isActive: cls.isActive ?? true, enrolledAt: cls.enrolledAt })
    })
  }
  if (pendingCurseducaClasses) {
    pendingCurseducaClasses.forEach((cls) => {
      allClasses.push({ classId: cls.classId, className: cls.className, source: 'curseduca', isActive: cls.isActive ?? true, enrolledAt: cls.enteredAt, role: cls.role })
    })
  } else if (user.curseduca?.enrolledClasses) {
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

  return plan
}

/** Pure flatten of the curseduca plan into dotted Mongo paths (minus sync timestamps). */
export function curseducaPlanToUpdateFields(plan: CurseducaMutationPlan): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const c = plan.curseduca

  if (c.curseducaUserId !== undefined) fields['curseduca.curseducaUserId'] = c.curseducaUserId
  if (c.curseducaUuid !== undefined) fields['curseduca.curseducaUuid'] = c.curseducaUuid
  if (c.enrollmentsCount !== undefined) fields['curseduca.enrollmentsCount'] = c.enrollmentsCount
  if (c.groupId !== undefined) fields['curseduca.groupId'] = c.groupId
  if (c.groupName !== undefined) fields['curseduca.groupName'] = c.groupName
  if (c.enrolledClasses !== undefined) fields['curseduca.enrolledClasses'] = c.enrolledClasses
  if (c.subscriptionType !== undefined) fields['curseduca.subscriptionType'] = c.subscriptionType
  if (c.situation !== undefined) fields['curseduca.situation'] = c.situation
  fields['curseduca.memberStatus'] = c.memberStatus
  if (c.lastAccess !== undefined) fields['curseduca.lastAccess'] = c.lastAccess
  if (c.lastLogin !== undefined) fields['curseduca.lastLogin'] = c.lastLogin
  if (c.joinedDate !== undefined) fields['curseduca.joinedDate'] = c.joinedDate
  if (c.progressEstimated !== undefined) fields['curseduca.progress.estimatedProgress'] = c.progressEstimated

  fields['combined.allClasses'] = plan.combined.allClasses
  if (plan.combined.primaryClass) fields['combined.primaryClass'] = plan.combined.primaryClass
  if (plan.combined.classId !== undefined) fields['combined.classId'] = plan.combined.classId
  if (plan.combined.className !== undefined) fields['combined.className'] = plan.combined.className
  if (plan.rootClassId !== undefined) fields['classId'] = plan.rootClassId
  if (plan.rootClassName !== undefined) fields['className'] = plan.rootClassName

  fields['curseduca.syncVersion'] = c.syncVersion
  fields['metadata.sources.curseduca.version'] = plan.metadata.sources.curseduca.version

  return fields
}
