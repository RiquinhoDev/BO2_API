import { Types } from 'mongoose'
import type { UniversalSyncType } from '../../types/universalSync.types'

export interface UniversalSnapshotContext {
  syncType: UniversalSyncType
  syncId: Types.ObjectId
}

export function createUniversalSnapshotContext(
  syncType: UniversalSyncType,
  syncHistoryId: string,
): UniversalSnapshotContext {
  return {
    syncType,
    syncId: new Types.ObjectId(syncHistoryId),
  }
}
