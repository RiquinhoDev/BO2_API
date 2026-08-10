// ════════════════════════════════════════════════════════════
// 📁 src/models/SyncModels/SyncReport.ts
// Model: Sync Report (Relatórios Detalhados de Sincronização)
// ════════════════════════════════════════════════════════════

import { Schema, model, Types } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// TYPES & ENUMS
// ─────────────────────────────────────────────────────────────

import type {
  ISyncReport, ISyncReportConfig, ISyncReportConflict, ISyncReportError,
  ISyncReportLog, ISyncReportMethods, ISyncReportModel, ISyncReportSnapshot,
  ISyncReportStats, ISyncReportWarning, SyncReportDocument, SyncType
} from './syncReport/contracts'

export type * from './syncReport/contracts'

const SyncReportStatsSchema = new Schema<ISyncReportStats>(
  {
    total: { type: Number, default: 0, min: 0 },
    inserted: { type: Number, default: 0, min: 0 },
    updated: { type: Number, default: 0, min: 0 },
    errors: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    unchanged: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
)

const SyncReportErrorSchema = new Schema<ISyncReportError>(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    message: { type: String, required: true },
    userId: { type: String },
    userEmail: { type: String },
    stack: { type: String },
    code: { type: String }
  },
  { _id: false }
)

const SyncReportWarningSchema = new Schema<ISyncReportWarning>(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    message: { type: String, required: true },
    userId: { type: String },
    context: { type: String }
  },
  { _id: false }
)

const SyncReportConflictSchema = new Schema<ISyncReportConflict>(
  {
    userId: { type: String, required: true },
    userEmail: { type: String, required: true },
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    resolution: { type: String, enum: ['auto', 'manual', 'pending'] },
    resolvedAt: { type: Date }
  },
  { _id: false }
)

const SyncReportSnapshotSchema = new Schema<ISyncReportSnapshot>(
  {
    timestamp: { type: Date, required: true },
    totalUsers: { type: Number, required: true },
    activeUsers: { type: Number, required: true },
    platformStats: {
      hotmart: { type: Number },
      curseduca: { type: Number },
      discord: { type: Number }
    }
  },
  { _id: false }
)

const SyncReportLogSchema = new Schema<ISyncReportLog>(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    level: { type: String, enum: ['info', 'warn', 'error', 'debug'], required: true },
    message: { type: String, required: true },
    meta: { type: Schema.Types.Mixed }
  },
  { _id: false }
)

const SyncReportConfigSchema = new Schema<ISyncReportConfig>(
  {
    fullSync: { type: Boolean, default: true },
    includeProgress: { type: Boolean, default: true },
    includeTags: { type: Boolean, default: false },
    batchSize: { type: Number, default: 500 },
    platforms: [{ type: String }]
  },
  { _id: false }
)

// ─────────────────────────────────────────────────────────────
// MAIN SCHEMA
// ─────────────────────────────────────────────────────────────

const syncReportSchema = new Schema<ISyncReport, ISyncReportModel, ISyncReportMethods>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'CronJobConfig',
      index: true
    },
    jobName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    syncType: {
      type: String,
      enum: ['hotmart', 'curseduca', 'discord', 'all'],
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
    duration: {
      type: Number,
      default: 0,
      min: 0
    },

    triggeredBy: {
      type: String,
      enum: ['MANUAL', 'CRON', 'WEBHOOK'],
      required: true,
      index: true
    },
    triggeredByUser: {
      type: Schema.Types.ObjectId,
      ref: 'Admin'
    },

    status: {
      type: String,
      enum: ['success', 'failed', 'partial', 'running'],
      default: 'running',
      index: true
    },
    stats: {
      type: SyncReportStatsSchema,
      default: () => ({
        total: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        skipped: 0,
        unchanged: 0
      })
    },

    platformStats: {
      hotmart: {
        processed: { type: Number, default: 0 },
        inserted: { type: Number, default: 0 },
        updated: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
      },
      curseduca: {
        processed: { type: Number, default: 0 },
        inserted: { type: Number, default: 0 },
        updated: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
      },
      discord: {
        processed: { type: Number, default: 0 },
        inserted: { type: Number, default: 0 },
        updated: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
      }
    },

    errors: [SyncReportErrorSchema],
    warnings: [SyncReportWarningSchema],
    conflicts: [SyncReportConflictSchema],
    logs: [SyncReportLogSchema],

    snapshots: {
      before: { type: SyncReportSnapshotSchema, required: true },
      after: SyncReportSnapshotSchema
    },

    syncConfig: {
      type: SyncReportConfigSchema,
      required: true
    },

    metadata: {
      apiVersion: String,
      serverVersion: String,
      environment: String,
      requestId: String
    }
  },
  {
    timestamps: true,
    collection: 'syncreports'
  }
)

// ─────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────

syncReportSchema.index({ startedAt: -1 })
syncReportSchema.index({ jobId: 1, startedAt: -1 })
syncReportSchema.index({ syncType: 1, startedAt: -1 })
syncReportSchema.index({ status: 1, startedAt: -1 })
syncReportSchema.index({ triggeredBy: 1, startedAt: -1 })

// ─────────────────────────────────────────────────────────────
// INSTANCE METHODS
// ─────────────────────────────────────────────────────────────

syncReportSchema.methods.addError = async function (
  this: SyncReportDocument,
  error: Omit<ISyncReportError, 'timestamp'>
) {
  this.errors.push({ ...error, timestamp: new Date() })
  this.stats.errors = this.errors.length
  return this.save()
}

syncReportSchema.methods.addWarning = async function (
  this: SyncReportDocument,
  warning: Omit<ISyncReportWarning, 'timestamp'>
) {
  this.warnings.push({ ...warning, timestamp: new Date() })
  return this.save()
}

syncReportSchema.methods.addLog = async function (
  this: SyncReportDocument,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  meta?: unknown
) {
  this.logs.push({ timestamp: new Date(), level, message, meta })
  return this.save()
}

syncReportSchema.methods.markAsComplete = async function (
  this: SyncReportDocument,
  status: 'success' | 'failed' | 'partial'
) {
  this.status = status
  this.completedAt = new Date()
  this.duration = Math.floor((this.completedAt.getTime() - this.startedAt.getTime()) / 1000)
  return this.save()
}

syncReportSchema.methods.getSuccessRate = function (this: SyncReportDocument): number {
  if (this.stats.total === 0) return 0
  const successful = this.stats.inserted + this.stats.updated + this.stats.unchanged
  return (successful / this.stats.total) * 100
}

syncReportSchema.methods.getSummary = function (this: SyncReportDocument) {
  return {
    jobName: this.jobName,
    duration: this.duration,
    status: this.status,
    successRate: this.getSuccessRate(),
    totalProcessed: this.stats.total,
    errorsCount: this.errors.length,
    warningsCount: this.warnings.length
  }
}

// ─────────────────────────────────────────────────────────────
// STATIC METHODS
// ─────────────────────────────────────────────────────────────

syncReportSchema.statics.findByJob = function (this: ISyncReportModel, jobId: string, limit = 20) {
  return this.find({ jobId }).sort({ startedAt: -1 }).limit(limit).exec()
}

syncReportSchema.statics.findByType = function (this: ISyncReportModel, syncType: SyncType, limit = 20) {
  return this.find({ syncType }).sort({ startedAt: -1 }).limit(limit).exec()
}

syncReportSchema.statics.findRecent = function (this: ISyncReportModel, limit = 20) {
  return this.find()
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('jobId', 'name syncType')
    .populate('triggeredByUser', 'name email')
    .exec()
}

syncReportSchema.statics.getAggregatedStats = async function (this: ISyncReportModel, days = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const reports = await this.find({
    startedAt: { $gte: cutoffDate },
    status: { $in: ['success', 'failed', 'partial'] }
  }).exec()

  const totalSyncs = reports.length
  const successfulSyncs = reports.filter(r => r.status === 'success').length
  const failedSyncs = reports.filter(r => r.status === 'failed').length

  const avgDuration =
    reports.length > 0 ? reports.reduce((sum, r) => sum + r.duration, 0) / reports.length : 0

  const totalProcessed = reports.reduce((sum, r) => sum + r.stats.total, 0)
  const totalErrors = reports.reduce((sum, r) => sum + r.stats.errors, 0)

  return {
    totalSyncs,
    successfulSyncs,
    failedSyncs,
    avgDuration: Math.floor(avgDuration),
    totalProcessed,
    totalErrors
  }
}

syncReportSchema.statics.getLastReportForJob = function (this: ISyncReportModel, jobId: string) {
  return this.findOne({ jobId }).sort({ startedAt: -1 }).exec()
}

// ─────────────────────────────────────────────────────────────
// EXPORT MODEL
// ─────────────────────────────────────────────────────────────

export const SyncReport = model<ISyncReport, ISyncReportModel>('SyncReport', syncReportSchema)
export default SyncReport
