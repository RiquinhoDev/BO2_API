import {
  WeeklyNativeTagSnapshot,
} from '../../../models/tagMonitoring'
import type { IWeeklyNativeTagSnapshot, TagChanges } from '../../../models/tagMonitoring/WeeklyNativeTagSnapshot'
import logger from '../../../utils/logger'
import {
  assertOwnership,
  isOwnershipFailure,
  type CleanupResult,
  type SnapshotData,
  type WeeklyTagSnapshotOptions,
} from './contracts'
import { WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES } from './limits'

function compareTags(currentTags: string[], previousTags: string[]): TagChanges {
  const current = new Set(currentTags)
  const previous = new Set(previousTags)
  return {
    added: currentTags.filter(tag => !previous.has(tag)),
    removed: previousTags.filter(tag => !current.has(tag)),
    unchanged: currentTags.filter(tag => previous.has(tag)),
  }
}

export function createVirtualSnapshot(data: SnapshotData): IWeeklyNativeTagSnapshot {
  return {
    ...data,
    compareWith(previousSnapshot: IWeeklyNativeTagSnapshot): TagChanges {
      return compareTags(data.nativeTags, previousSnapshot?.nativeTags || [])
    },
  } as IWeeklyNativeTagSnapshot
}

export async function persistSnapshot(
  data: SnapshotData,
  options: WeeklyTagSnapshotOptions,
): Promise<{
  success: boolean
  snapshot?: IWeeklyNativeTagSnapshot
  created?: boolean
  updated?: boolean
  changes?: TagChanges
}> {
  if (options.dryRun === true) {
    const previousSnapshot = await WeeklyNativeTagSnapshot.findPreviousSnapshot(
      data.email,
      data.weekNumber,
      data.year,
    )
    assertOwnership(options)
    const snapshot = createVirtualSnapshot(data)
    return {
      success: true,
      snapshot,
      created: false,
      updated: false,
      changes: previousSnapshot ? snapshot.compareWith(previousSnapshot) : undefined,
    }
  }

  assertOwnership(options)
  options.phaseHooks?.localMutationStarted()
  assertOwnership(options)
  const snapshotResult = await WeeklyNativeTagSnapshot.findOneAndUpdate(
    {
      email: data.email,
      weekNumber: data.weekNumber,
      year: data.year,
    },
    { $set: data },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      includeResultMetadata: true,
    },
  )
  const snapshot = snapshotResult?.value
  if (!snapshot) {
    logger.error(`Snapshot semanal não devolvido para ${data.email}`)
    return { success: false }
  }

  const previousSnapshot = await WeeklyNativeTagSnapshot.findPreviousSnapshot(
    data.email,
    data.weekNumber,
    data.year,
  )
  assertOwnership(options)

  return {
    success: true,
    snapshot,
    created: Boolean(snapshotResult.lastErrorObject?.upserted),
    updated: !snapshotResult.lastErrorObject?.upserted,
    changes: previousSnapshot ? snapshot.compareWith(previousSnapshot) : undefined,
  }
}

export async function cleanupOldSnapshots(
  options: WeeklyTagSnapshotOptions,
): Promise<CleanupResult> {
  try {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    assertOwnership(options)
    const rows = await WeeklyNativeTagSnapshot.find({ capturedAt: { $lt: sixMonthsAgo } })
      .sort({ capturedAt: 1, _id: 1 })
      .select({ _id: 1 })
      .limit(WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES + 1)
      .lean()
      .exec()
    assertOwnership(options)

    const truncated = rows.length > WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES
    const ids = rows
      .slice(0, WEEKLY_TAG_SNAPSHOT_CLEANUP_MAX_CANDIDATES)
      .map(row => row._id)
    const base = {
      candidates: ids.length,
      skipped: 0,
      truncated,
      remaining: truncated ? 1 : 0,
    }
    if (options.dryRun === true || ids.length === 0) return { deleted: 0, ...base }

    assertOwnership(options)
    const revalidated = await WeeklyNativeTagSnapshot.find({
      _id: { $in: ids },
      capturedAt: { $lt: sixMonthsAgo },
    })
      .sort({ capturedAt: 1, _id: 1 })
      .select({ _id: 1 })
      .limit(ids.length + 1)
      .lean()
      .exec()
    assertOwnership(options)
    const revalidatedIds = revalidated.map(row => row._id)
    const expectedIds = new Set(ids.map(id => String(id)))
    const selectedIds = revalidatedIds.filter(id => expectedIds.has(String(id)))
    if (selectedIds.length === 0) {
      return {
        deleted: 0,
        candidates: ids.length,
        skipped: ids.length,
        truncated,
        remaining: truncated ? 1 : 0,
      }
    }

    options.phaseHooks?.localMutationStarted()
    assertOwnership(options)
    const result = await WeeklyNativeTagSnapshot.deleteMany({
      _id: { $in: selectedIds },
      capturedAt: { $lt: sixMonthsAgo },
    })
    logger.info(`🗑️  Snapshots antigos removidos: ${result.deletedCount || 0}`)
    return {
      deleted: result.deletedCount || 0,
      candidates: ids.length,
      skipped: ids.length - (result.deletedCount || 0),
      truncated,
      remaining: truncated ? 1 : 0,
    }
  } catch (error: unknown) {
    if (isOwnershipFailure(error)) throw error
    logger.error('Erro ao limpar snapshots antigos:', error)
    throw error
  }
}
