import type mongoose from 'mongoose'
import type { Document, Model } from 'mongoose'

export type Platform = 'HOTMART' | 'CURSEDUCA' | 'DISCORD'
export type SnapshotSource = 'SYNC' | 'CRON' | 'MANUAL'

export interface IProgressSnapshot {
  completedLessons: number
  totalLessons: number
  percentage: number
}

export interface IActivitySnapshot extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  platform: Platform
  snapshotMonth: Date
  wasActive: boolean
  hadLogin: boolean
  hadActivity: boolean
  loginCount: number
  activityCount: number
  engagementScore: number
  progress?: IProgressSnapshot
  platformSpecific?: {
    hotmart?: {
      accessCount: number
      lastAccessDate?: Date
      completedLessonsInMonth: number
    }
    curseduca?: {
      groupActivity: number
      memberStatus: 'ACTIVE' | 'INACTIVE'
    }
    discord?: {
      messageCount: number
      voiceMinutes: number
      reactionCount: number
    }
  }
  createdAt: Date
  source: SnapshotSource
  syncHistoryId?: mongoose.Types.ObjectId
}

export interface IActivitySnapshotMethods {
  calculateEngagementScore(): number
  isOlderThan(months: number): boolean
}

export interface IActivitySnapshotModel
  extends Model<IActivitySnapshot, {}, IActivitySnapshotMethods> {
  getSnapshotForMonth(
    userId: mongoose.Types.ObjectId,
    platform: Platform,
    month: Date
  ): Promise<IActivitySnapshot | null>
  getUserSnapshots(
    userId: mongoose.Types.ObjectId,
    startMonth: Date,
    endMonth: Date,
    platform?: Platform
  ): Promise<IActivitySnapshot[]>
  getActiveUsersInMonth(
    month: Date,
    platform: Platform
  ): Promise<mongoose.Types.ObjectId[]>
  getCohortRetention(
    cohortMonth: Date,
    platform: Platform,
    milestone: number
  ): Promise<{ total: number; active: number; rate: number }>
  cleanupOldSnapshots(olderThanMonths?: number): Promise<number>
  getMonthlyStats(
    month: Date,
    platform?: Platform
  ): Promise<{
    totalSnapshots: number
    activeUsers: number
    avgEngagement: number
    avgActivityCount: number
  }>
}
