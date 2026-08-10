import type { UniversalSourceItem } from '../../../types/universalSync.types'

type CurseducaGroup = NonNullable<UniversalSourceItem['allCurseducaGroups']>[number]

export interface CurseducaEnrollmentRecord {
  classId: string
  className: string
  curseducaId: string
  curseducaUuid: string
  enteredAt: Date
  expiresAt?: Date
  isActive: boolean
  role: 'student' | 'assistant' | 'teacher'
}

export function isCurseducaEnrollmentActive(situation: unknown): boolean {
  return situation !== 'INACTIVE' && situation !== 'SUSPENDED'
}

function toValidDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function buildCurseducaEnrollment(
  group: CurseducaGroup,
): CurseducaEnrollmentRecord {
  const groupId = String(group.groupId)
  return {
    classId: groupId,
    className: group.groupName || `Grupo ${groupId}`,
    curseducaId: groupId,
    curseducaUuid: groupId,
    enteredAt: toValidDate(group.enrolledAt) || new Date(),
    expiresAt: toValidDate(group.expiresAt),
    isActive: isCurseducaEnrollmentActive(group.situation),
    role: group.role || 'student',
  }
}

export function attachCurseducaMemberships(
  items: UniversalSourceItem[],
): UniversalSourceItem[] {
  const groupsByEmail = new Map<string, Map<string, CurseducaGroup>>()

  for (const item of items) {
    const email = item.email?.trim().toLowerCase()
    if (!email || item.groupId === undefined || item.groupId === null) continue

    const groupId = String(item.groupId)
    const groups = groupsByEmail.get(email) ?? new Map<string, CurseducaGroup>()
    groups.set(groupId, {
      groupId,
      groupName: item.groupName,
      enrolledAt: item.enrolledAt,
      expiresAt: item.expiresAt,
      role: 'student',
      situation: item.platformData?.situation,
    })
    groupsByEmail.set(email, groups)
  }

  return items.map(item => {
    const email = item.email?.trim().toLowerCase()
    const groups = email ? groupsByEmail.get(email) : undefined
    if (!groups) return item

    return {
      ...item,
      allCurseducaGroups: [...groups.values()],
    }
  })
}
