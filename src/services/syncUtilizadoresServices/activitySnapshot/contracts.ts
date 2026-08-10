import type mongoose from 'mongoose'
import type { Platform, SnapshotSource } from '../../../models/SyncModels/ActivitySnapshot'

export interface CreateSnapshotDTO {
  userId: mongoose.Types.ObjectId
  platform: Platform
  month: Date
  wasActive: boolean
  hadLogin: boolean
  hadActivity: boolean
  loginCount?: number
  activityCount?: number
  engagementScore?: number
  progress?: {
    completedLessons: number
    totalLessons: number
    percentage: number
  }
  platformSpecific?: unknown
  source?: SnapshotSource
  syncHistoryId?: mongoose.Types.ObjectId
}

export interface MonthlyBatchDTO {
  month: Date
  platform: Platform
  userActivities: Array<{
    userId: mongoose.Types.ObjectId
    wasActive: boolean
    hadLogin: boolean
    hadActivity: boolean
    loginCount: number
    activityCount: number
    progress?: {
      completedLessons: number
      totalLessons: number
      percentage: number
    }
  }>
  source?: SnapshotSource
}

export interface CohortRetentionData {
  cohortMonth: Date
  platform: Platform
  milestones: Array<{
    month: number
    total: number
    active: number
    rate: number
  }>
}
