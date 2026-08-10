// ════════════════════════════════════════════════════════════
// 📁 src/models/ActivitySnapshot.ts
// Model: Activity Snapshot
// Snapshots mensais de atividade para Cohort Analysis perfeito
// ════════════════════════════════════════════════════════════

import mongoose, { Schema } from 'mongoose'
import type {
  IActivitySnapshot,
  IActivitySnapshotMethods,
  IActivitySnapshotModel,
  IProgressSnapshot,
  Platform,
} from './activitySnapshot/contracts'

export type {
  IActivitySnapshot,
  IActivitySnapshotMethods,
  IActivitySnapshotModel,
  IProgressSnapshot,
  Platform,
  SnapshotSource,
} from './activitySnapshot/contracts'

const ProgressSnapshotSchema = new Schema<IProgressSnapshot>({
  completedLessons: {
    type: Number,
    default: 0,
    min: 0
  },
  totalLessons: {
    type: Number,
    default: 0,
    min: 0
  },
  percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, { _id: false })

const PlatformSpecificSchema = new Schema({
  hotmart: {
    accessCount: { type: Number, default: 0 },
    lastAccessDate: { type: Date },
    completedLessonsInMonth: { type: Number, default: 0 }
  },
  curseduca: {
    groupActivity: { type: Number, default: 0 },
    memberStatus: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE']
    }
  },
  discord: {
    messageCount: { type: Number, default: 0 },
    voiceMinutes: { type: Number, default: 0 },
    reactionCount: { type: Number, default: 0 }
  }
}, { _id: false })

// ─────────────────────────────────────────────────────────────
// SCHEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────

const ActivitySnapshotSchema = new Schema<
  IActivitySnapshot,
  IActivitySnapshotModel,
  IActivitySnapshotMethods
>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['HOTMART', 'CURSEDUCA', 'DISCORD'],
    required: true,
    index: true
  },
  snapshotMonth: {
    type: Date,
    required: true,
    index: true,
    validate: {
      validator: function(v: Date) {
        // Garantir que é sempre dia 1 do mês às 00:00:00
        return v.getDate() === 1 && 
               v.getHours() === 0 && 
               v.getMinutes() === 0 && 
               v.getSeconds() === 0
      },
      message: 'snapshotMonth deve ser sempre o primeiro dia do mês às 00:00:00'
    }
  },
  wasActive: {
    type: Boolean,
    required: true,
    default: false,
    index: true
  },
  hadLogin: {
    type: Boolean,
    required: true,
    default: false
  },
  hadActivity: {
    type: Boolean,
    required: true,
    default: false
  },
  loginCount: {
    type: Number,
    default: 0,
    min: 0
  },
  activityCount: {
    type: Number,
    default: 0,
    min: 0
  },
  engagementScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  progress: {
    type: ProgressSnapshotSchema
  },
  platformSpecific: {
    type: PlatformSpecificSchema
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    enum: ['SYNC', 'CRON', 'MANUAL'],
    required: true,
    default: 'SYNC'
  },
  syncHistoryId: {
    type: Schema.Types.ObjectId,
    ref: 'SyncHistory'
  }
}, {
  timestamps: false,  // Não precisamos de updatedAt
  collection: 'useractivitysnapshots'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

// Índice único: Um user só pode ter 1 snapshot por plataforma por mês
ActivitySnapshotSchema.index(
  { userId: 1, platform: 1, snapshotMonth: 1 },
  { unique: true }
)

// Índices para queries de cohort analysis
ActivitySnapshotSchema.index({ platform: 1, snapshotMonth: 1, wasActive: 1 })
ActivitySnapshotSchema.index({ userId: 1, snapshotMonth: 1 })
ActivitySnapshotSchema.index({ snapshotMonth: 1, createdAt: -1 })

// Índice para cleanup (apagar snapshots antigos)
ActivitySnapshotSchema.index({ snapshotMonth: 1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS DE INSTÂNCIA
// ─────────────────────────────────────────────────────────────

ActivitySnapshotSchema.methods.calculateEngagementScore = function(): number {
  let score = 0
  
  // Login contribui 20%
  if (this.hadLogin) {
    score += 20
  }
  
  // Atividade contribui 30%
  if (this.hadActivity) {
    score += 30
  }
  
  // Número de logins (até 20%)
  score += Math.min(this.loginCount * 2, 20)
  
  // Número de atividades (até 30%)
  score += Math.min(this.activityCount * 3, 30)
  
  return Math.min(score, 100)
}

ActivitySnapshotSchema.methods.isOlderThan = function(months: number): boolean {
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1)
  return this.snapshotMonth < cutoff
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

ActivitySnapshotSchema.statics.getSnapshotForMonth = async function(
  userId: mongoose.Types.ObjectId,
  platform: Platform,
  month: Date
): Promise<IActivitySnapshot | null> {
  // Normalizar para primeiro dia do mês
  const normalizedMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  
  return this.findOne({
    userId,
    platform,
    snapshotMonth: normalizedMonth
  })
}

ActivitySnapshotSchema.statics.getUserSnapshots = async function(
  userId: mongoose.Types.ObjectId,
  startMonth: Date,
  endMonth: Date,
  platform?: Platform
): Promise<IActivitySnapshot[]> {
  const query: any = {
    userId,
    snapshotMonth: {
      $gte: new Date(startMonth.getFullYear(), startMonth.getMonth(), 1),
      $lte: new Date(endMonth.getFullYear(), endMonth.getMonth(), 1)
    }
  }
  
  if (platform) {
    query.platform = platform
  }
  
  return this.find(query).sort({ snapshotMonth: 1 })
}

ActivitySnapshotSchema.statics.getActiveUsersInMonth = async function(
  month: Date,
  platform: Platform
): Promise<mongoose.Types.ObjectId[]> {
  const normalizedMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  
  const snapshots = await this.find({
    platform,
    snapshotMonth: normalizedMonth,
    wasActive: true
  })
    .select('userId')
    .lean()

  const userIds = (snapshots as Array<{ userId: mongoose.Types.ObjectId }>).map(
    (s) => s.userId
  )

  return userIds
}

ActivitySnapshotSchema.statics.getCohortRetention = async function(
  cohortMonth: Date,
  platform: Platform,
  milestone: number
): Promise<{ total: number, active: number, rate: number }> {
  // Mês da cohort (quando entraram)
  const normalizedCohortMonth = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth(), 1)
  
  // Mês do milestone (ex: M3 = cohortMonth + 3 meses)
  const milestoneMonth = new Date(cohortMonth)
  milestoneMonth.setMonth(milestoneMonth.getMonth() + milestone)
  const normalizedMilestoneMonth = new Date(milestoneMonth.getFullYear(), milestoneMonth.getMonth(), 1)
  
  // Total de users na cohort (enrolled no mês da cohort)
const cohortSnapshots = await this.find({
  platform,
  snapshotMonth: normalizedCohortMonth
})
  .select('userId')
  .lean()

const cohortUserIds = (cohortSnapshots as Array<{ userId: mongoose.Types.ObjectId }>).map(
  (s) => s.userId
)
const totalUsers = cohortUserIds.length


  
  // Users ativos no milestone
  const activeCount = await this.countDocuments({
    platform,
    snapshotMonth: normalizedMilestoneMonth,
    wasActive: true,
    userId: { $in: cohortUserIds }
  })
  
  return {
    total: totalUsers,
    active: activeCount,
    rate: totalUsers > 0 ? (activeCount / totalUsers) * 100 : 0
  }
}

ActivitySnapshotSchema.statics.cleanupOldSnapshots = async function(
  olderThanMonths: number = 18
): Promise<number> {
  const now = new Date()
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - olderThanMonths, 1)
  
  const result = await this.deleteMany({
    snapshotMonth: { $lt: cutoffDate }
  })
  
  return result.deletedCount || 0
}

ActivitySnapshotSchema.statics.getMonthlyStats = async function(
  month: Date,
  platform?: Platform
): Promise<{
  totalSnapshots: number
  activeUsers: number
  avgEngagement: number
  avgActivityCount: number
}> {
  const normalizedMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  
  const query: any = { snapshotMonth: normalizedMonth }
  if (platform) query.platform = platform
  
  const stats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalSnapshots: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: ['$wasActive', 1, 0] }
        },
        avgEngagement: { $avg: '$engagementScore' },
        avgActivityCount: { $avg: '$activityCount' }
      }
    }
  ])
  
  if (stats.length === 0) {
    return {
      totalSnapshots: 0,
      activeUsers: 0,
      avgEngagement: 0,
      avgActivityCount: 0
    }
  }
  
  return stats[0]
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

// Antes de salvar, normalizar snapshotMonth
ActivitySnapshotSchema.pre(
  'save',
  function (this: IActivitySnapshot & IActivitySnapshotMethods, next) {
    if (this.snapshotMonth) {
      const normalized = new Date(
        this.snapshotMonth.getFullYear(),
        this.snapshotMonth.getMonth(),
        1,
        0, 0, 0, 0
      )
      this.snapshotMonth = normalized
    }
    
    if (this.engagementScore === 0 && (this.hadLogin || this.hadActivity)) {
      this.engagementScore = this.calculateEngagementScore()
    }
    
    next()
  }
)



// ─────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────


const ActivitySnapshot: IActivitySnapshotModel =
  (mongoose.models.ActivitySnapshot as IActivitySnapshotModel) ||
  mongoose.model<IActivitySnapshot, IActivitySnapshotModel>(
    'ActivitySnapshot',
    ActivitySnapshotSchema
  )

export default ActivitySnapshot
