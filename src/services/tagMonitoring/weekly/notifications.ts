import type { IWeeklyNativeTagSnapshot, TagChanges } from '../../../models/tagMonitoring/WeeklyNativeTagSnapshot'
import User from '../../../models/user'
import UserProduct from '../../../models/UserProduct'
import tagNotificationService, { type StudentChange } from '../tagNotification.service'
import { assertOwnership, type WeeklyTagSnapshotOptions } from './contracts'
import {
  WEEKLY_TAG_SNAPSHOT_MAX_NOTIFICATION_DETAILS,
  WeeklyTagNotificationLimitError,
} from './limits'

export interface CriticalChange {
  tagName: string
  changeType: 'ADDED' | 'REMOVED'
  students: StudentChange[]
}

async function buildStudentChange(
  email: string,
  snapshot: IWeeklyNativeTagSnapshot,
  options: WeeklyTagSnapshotOptions,
): Promise<StudentChange | null> {
  assertOwnership(options)
  const user = await User.findOne({ email }).select('name').lean()
  assertOwnership(options)
  if (!user) return null

  const userProduct = await UserProduct.findOne({ userId: user._id, status: 'ACTIVE' })
    .populate<{ productId: { name?: string } }>('productId')
    .lean()
  assertOwnership(options)
  return {
    email,
    userName: user.name || email,
    product: userProduct?.productId?.name || 'N/A',
    class: userProduct?.classes?.[0]?.className || undefined,
    currentTags: snapshot.nativeTags,
  }
}

export async function appendCriticalChanges(input: {
  email: string
  changes: TagChanges
  snapshot: IWeeklyNativeTagSnapshot
  criticalTagNames: readonly string[]
  changesMap: Map<string, StudentChange[]>
  notificationDetails: number
  options: WeeklyTagSnapshotOptions
}): Promise<{ notificationDetails: number; truncated: boolean }> {
  const criticalSet = new Set(input.criticalTagNames)
  let notificationDetails = input.notificationDetails
  let truncated = false

  const append = async (tag: string, changeType: 'ADDED' | 'REMOVED') => {
    if (!criticalSet.has(tag)) return
    if (notificationDetails >= WEEKLY_TAG_SNAPSHOT_MAX_NOTIFICATION_DETAILS) {
      if (input.options.dryRun !== true) throw new WeeklyTagNotificationLimitError()
      truncated = true
      return
    }
    const student = await buildStudentChange(input.email, input.snapshot, input.options)
    if (!student) return
    const key = `${tag}|${changeType}`
    if (!input.changesMap.has(key)) input.changesMap.set(key, [])
    input.changesMap.get(key)!.push(student)
    notificationDetails++
  }

  for (const tag of input.changes.added) await append(tag, 'ADDED')
  for (const tag of input.changes.removed) await append(tag, 'REMOVED')
  return { notificationDetails, truncated }
}

export function criticalChangesFromMap(changesMap: Map<string, StudentChange[]>): CriticalChange[] {
  const changes: CriticalChange[] = []
  changesMap.forEach((students, key) => {
    const [tagName, changeType] = key.split('|')
    changes.push({ tagName, changeType: changeType as 'ADDED' | 'REMOVED', students })
  })
  return changes
}

export async function createNotifications(
  changes: readonly CriticalChange[],
  options: WeeklyTagSnapshotOptions,
): Promise<number> {
  if (options.dryRun === true || changes.length === 0) return 0

  let created = 0
  const currentDate = new Date()
  const weekNumber = getWeekNumber(currentDate)
  const year = currentDate.getFullYear()
  for (const change of changes) {
    assertOwnership(options)
    options.phaseHooks?.localMutationStarted()
    assertOwnership(options)
    const result = await tagNotificationService.createGroupedNotificationWithStatus(
      change.tagName,
      change.changeType,
      weekNumber,
      year,
      change.students,
    )
    if (result.created) created++
  }
  return created
}

function getWeekNumber(date: Date): number {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  return Math.ceil(((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
