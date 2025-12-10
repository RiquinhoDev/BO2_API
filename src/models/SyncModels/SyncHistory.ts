// ════════════════════════════════════════════════════════════
// 📁 src/models/SyncHistory.ts
// Model: Sync History (UPDATED)
// Histórico detalhado de sincronizações com métricas avançadas
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, model, Document, Model } from "mongoose"

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type SyncType = "hotmart" | "curseduca" | "csv" | "discord"
export type SyncStatus = "pending" | "running" | "completed" | "failed" | "cancelled"
export type TriggerType = "MANUAL" | "CRON" | "WEBHOOK"

export interface ISyncStats {
  total: number
  added: number
  updated: number
  conflicts: number
  errors: number
}

export interface ISyncMetrics {
  duration: number                // Duração total (segundos)
  usersPerSecond: number          // Throughput
  avgTimePerUser: number          // Tempo médio por user (ms)
  peakMemoryUsage?: number        // MB
}

export interface ISyncOperations {
  inserts: number
  updates: number
  skipped: number                 // Já atualizados
  errors: number
}

export interface ITriggeredBy {
  type: TriggerType
  userId?: mongoose.Types.ObjectId
  cronJobId?: mongoose.Types.ObjectId
  webhookId?: string
}

export interface ISyncHistory extends Document {
  type: SyncType
  startedAt: Date
  completedAt?: Date
  status: SyncStatus
  stats: ISyncStats
  errorDetails?: string[]
  user?: string
  metadata?: {
    fileName?: string
    fileSize?: number
    apiVersion?: string
    requestId?: string
  }
  duration?: number // em segundos (deprecated, usar metrics.duration)
  
  // 🆕 Métricas detalhadas
  metrics?: ISyncMetrics
  
  // 🆕 Breakdown por operação
  operations?: ISyncOperations
  
  // 🆕 Conflitos detetados
  conflictsDetected?: number
  conflictIds?: mongoose.Types.ObjectId[]
  
  // 🆕 Activity snapshots criados
  snapshotsCreated?: number
  
  // 🆕 Triggered by
  triggeredBy?: ITriggeredBy
}

// 👇 Métodos de instância do schema
export interface ISyncHistoryMethods {
  complete(
    finalStats: Partial<ISyncStats>,
    finalMetrics?: Partial<ISyncMetrics>
  ): Promise<void>

  fail(
    error: string,
    partialStats?: Partial<ISyncStats>
  ): Promise<void>

  cancel(reason?: string): Promise<void>

  addConflict(conflictId: mongoose.Types.ObjectId): Promise<void>

  getSuccessRate(): number
  getThroughput(): number
}

// 👇 Tipo do resultado de getSyncStats (podes refinar se quiseres)
export interface IAggregatedSyncStats {
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  successRate: number
  totalUsers: number
  totalAdded: number
  totalUpdated: number
  totalErrors: number
  totalConflicts: number
  avgDuration: number
  avgThroughput: number
}

// 👇 Interface do Model com os statics
export interface ISyncHistoryModel
  extends Model<ISyncHistory, {}, ISyncHistoryMethods> {
  getRecentSyncs(type?: SyncType, limit?: number): Promise<(ISyncHistory & ISyncHistoryMethods)[]>
  getActiveSyncs(): Promise<(ISyncHistory & ISyncHistoryMethods)[]>
  getSyncStats(type?: SyncType, days?: number): Promise<IAggregatedSyncStats>
  getLastSyncByType(type: SyncType): Promise<(ISyncHistory & ISyncHistoryMethods) | null>
}

// ─────────────────────────────────────────────────────────────
// SUB-SCHEMAS
// ─────────────────────────────────────────────────────────────

const SyncStatsSchema = new Schema<ISyncStats>({
  total: { type: Number, default: 0 },
  added: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  conflicts: { type: Number, default: 0 },
  errors: { type: Number, default: 0 }
}, { _id: false })

const SyncMetricsSchema = new Schema<ISyncMetrics>({
  duration: {
    type: Number,
    required: true,
    min: 0
  },
  usersPerSecond: {
    type: Number,
    default: 0,
    min: 0
  },
  avgTimePerUser: {
    type: Number,
    default: 0,
    min: 0
  },
  peakMemoryUsage: {
    type: Number,
    min: 0
  }
}, { _id: false })

const SyncOperationsSchema = new Schema<ISyncOperations>({
  inserts: { type: Number, default: 0 },
  updates: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  errors: { type: Number, default: 0 }
}, { _id: false })

const TriggeredBySchema = new Schema<ITriggeredBy>({
  type: {
    type: String,
    enum: ['MANUAL', 'CRON', 'WEBHOOK'],
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  cronJobId: {
    type: Schema.Types.ObjectId,
    ref: 'CronJobConfig'
  },
  webhookId: {
    type: String
  }
}, { _id: false })

const MetadataSchema = new Schema({
  fileName: { type: String },
  fileSize: { type: Number },
  apiVersion: { type: String },
  requestId: { type: String }
}, { _id: false })

// ─────────────────────────────────────────────────────────────
// SCHEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────

const syncHistorySchema = new Schema<
  ISyncHistory,
  ISyncHistoryModel,
  ISyncHistoryMethods
>({
  type: { 
    type: String, 
    enum: ["hotmart", "curseduca", "csv", "discord"], 
    required: true,
    index: true
  },
  startedAt: { 
    type: Date, 
    default: Date.now, 
    required: true,
    index: true
  },
  completedAt: { 
    type: Date 
  },
  status: { 
    type: String, 
    enum: ["pending", "running", "completed", "failed", "cancelled"], 
    default: "pending",
    index: true
  },
  stats: {
    type: SyncStatsSchema,
    default: () => ({
      total: 0,
      added: 0,
      updated: 0,
      conflicts: 0,
      errors: 0
    })
  },
  errorDetails: [{ type: String }],
  user: { 
    type: String,
    index: true
  },
  metadata: {
    type: MetadataSchema
  },
  duration: { 
    type: Number  // Deprecated, manter para backwards compatibility
  },
  
  // 🆕 Campos novos
  metrics: {
    type: SyncMetricsSchema
  },
  operations: {
    type: SyncOperationsSchema
  },
  conflictsDetected: {
    type: Number,
    default: 0
  },
  conflictIds: [{
    type: Schema.Types.ObjectId,
    ref: 'SyncConflict'
  }],
  snapshotsCreated: {
    type: Number,
    default: 0
  },
  triggeredBy: {
    type: TriggeredBySchema
  }
}, {
  timestamps: true,
  collection: 'synchistories'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

syncHistorySchema.index({ type: 1, startedAt: -1 })
syncHistorySchema.index({ status: 1, startedAt: -1 })
syncHistorySchema.index({ user: 1 })
syncHistorySchema.index({ 'triggeredBy.type': 1, startedAt: -1 })
syncHistorySchema.index({ 'triggeredBy.cronJobId': 1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS DE INSTÂNCIA
// ─────────────────────────────────────────────────────────────

syncHistorySchema.methods.complete = async function(
  finalStats: Partial<ISyncStats>,
  finalMetrics?: Partial<ISyncMetrics>
): Promise<void> {
  this.status = 'completed'
  this.completedAt = new Date()
  
  // Atualizar stats
  if (finalStats) {
    Object.assign(this.stats, finalStats)
  }
  
  // Calcular e salvar métricas
  if (this.startedAt && this.completedAt) {
    const durationSeconds = Math.round((this.completedAt.getTime() - this.startedAt.getTime()) / 1000)
    
    this.metrics = {
      duration: durationSeconds,
      usersPerSecond: durationSeconds > 0 ? this.stats.total / durationSeconds : 0,
      avgTimePerUser: this.stats.total > 0 ? (durationSeconds * 1000) / this.stats.total : 0,
      peakMemoryUsage: finalMetrics?.peakMemoryUsage
    }
    
    // Backwards compatibility
    this.duration = durationSeconds
  }
  
  await this.save()
}

syncHistorySchema.methods.fail = async function(
  error: string,
  partialStats?: Partial<ISyncStats>
): Promise<void> {
  this.status = 'failed'
  this.completedAt = new Date()
  
  if (!this.errorDetails) {
    this.errorDetails = []
  }
  this.errorDetails.push(error)
  
  if (partialStats) {
    Object.assign(this.stats, partialStats)
  }
  
  // Calcular métricas parciais
  if (this.startedAt && this.completedAt) {
    const durationSeconds = Math.round((this.completedAt.getTime() - this.startedAt.getTime()) / 1000)
    this.metrics = {
      duration: durationSeconds,
      usersPerSecond: 0,
      avgTimePerUser: 0
    }
    this.duration = durationSeconds
  }
  
  await this.save()
}

syncHistorySchema.methods.cancel = async function(reason?: string): Promise<void> {
  this.status = 'cancelled'
  this.completedAt = new Date()
  
  if (reason) {
    if (!this.errorDetails) {
      this.errorDetails = []
    }
    this.errorDetails.push(`Cancelled: ${reason}`)
  }
  
  await this.save()
}

syncHistorySchema.methods.addConflict = async function(
  conflictId: mongoose.Types.ObjectId
): Promise<void> {
  if (!this.conflictIds) {
    this.conflictIds = []
  }
  
  this.conflictIds.push(conflictId)
  this.conflictsDetected = (this.conflictsDetected || 0) + 1
  this.stats.conflicts = (this.stats.conflicts || 0) + 1
  
  await this.save()
}

syncHistorySchema.methods.getSuccessRate = function(): number {
  if (this.stats.total === 0) return 0
  const successful = this.stats.total - this.stats.errors
  return (successful / this.stats.total) * 100
}

syncHistorySchema.methods.getThroughput = function(): number {
  if (!this.metrics?.duration || this.metrics.duration === 0) return 0
  return this.stats.total / this.metrics.duration
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

syncHistorySchema.statics.getRecentSyncs = async function(
  type?: SyncType,
  limit: number = 20
) {
  const query: any = {}
  if (type) query.type = type
  
  return this.find(query)
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('triggeredBy.userId', 'name email')
    .populate('triggeredBy.cronJobId', 'name')
}

syncHistorySchema.statics.getActiveSyncs = async function() {
  return this.find({
    status: { $in: ['pending', 'running'] }
  }).sort({ startedAt: -1 })
}

syncHistorySchema.statics.getSyncStats = async function(
  type?: SyncType,
  days: number = 30
): Promise<IAggregatedSyncStats> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  const query: any = {
    startedAt: { $gte: cutoffDate },
    status: { $in: ['completed', 'failed'] }
  }
  
  if (type) query.type = type
  
  const stats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalSyncs: { $sum: 1 },
        successfulSyncs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failedSyncs: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        totalUsers: { $sum: '$stats.total' },
        totalAdded: { $sum: '$stats.added' },
        totalUpdated: { $sum: '$stats.updated' },
        totalErrors: { $sum: '$stats.errors' },
        totalConflicts: { $sum: '$conflictsDetected' },
        avgDuration: { $avg: '$metrics.duration' },
        avgThroughput: { $avg: '$metrics.usersPerSecond' }
      }
    }
  ])
  
  if (stats.length === 0) {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      successRate: 0,
      totalUsers: 0,
      totalAdded: 0,
      totalUpdated: 0,
      totalErrors: 0,
      totalConflicts: 0,
      avgDuration: 0,
      avgThroughput: 0
    }
  }
  
  const result = stats[0] as IAggregatedSyncStats & { _id?: any }
  result.successRate = result.totalSyncs > 0 
    ? (result.successfulSyncs / result.totalSyncs) * 100 
    : 0
  
  return result
}

syncHistorySchema.statics.getLastSyncByType = async function(type: SyncType) {
  return this.findOne({ 
    type,
    status: 'completed'
  }).sort({ completedAt: -1 })
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

// Calcular duração automaticamente (backwards compatibility)
syncHistorySchema.pre('save', function(next) {
  if (this.completedAt && this.startedAt && !this.duration) {
    this.duration = Math.round((this.completedAt.getTime() - this.startedAt.getTime()) / 1000)
  }
  next()
})

// ─────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────

const SyncHistory =
  (mongoose.models.SyncHistory as ISyncHistoryModel) ||
  model<ISyncHistory, ISyncHistoryModel>("SyncHistory", syncHistorySchema)

export default SyncHistory

