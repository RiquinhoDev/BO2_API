// ════════════════════════════════════════════════════════════
// 📁 src/models/SyncConflict.ts
// Model: Sync Conflict (Typed statics + methods)
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document, Model } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type ConflictType =
  | 'DUPLICATE_EMAIL'
  | 'DIFFERENT_IDS'
  | 'MISSING_DATA'
  | 'INVALID_DATA'
  | 'PLATFORM_MISMATCH'
  | 'CLASS_CONFLICT'
  | 'STATUS_CONFLICT'

export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ConflictStatus = 'PENDING' | 'RESOLVED' | 'IGNORED' | 'AUTO_RESOLVED'
export type ResolutionAction = 'MERGED' | 'KEPT_EXISTING' | 'USED_NEW' | 'MANUAL' | 'IGNORED'
export type Platform = 'hotmart' | 'curseduca' | 'discord' | 'system'

export interface IConflictData {
  field: string
  existingValue: any
  newValue: any
  platform: Platform
  context?: any
}

export interface IResolution {
  action: ResolutionAction
  resolvedBy: mongoose.Types.ObjectId
  resolvedAt: Date
  notes?: string
  appliedChanges?: any
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT INTERFACE (instance methods included)
// ─────────────────────────────────────────────────────────────

export interface ISyncConflict extends Document {
  _id: mongoose.Types.ObjectId

  userId?: mongoose.Types.ObjectId
  email: string
  syncHistoryId: mongoose.Types.ObjectId

  conflictType: ConflictType
  severity: ConflictSeverity

  title: string
  description: string

  conflictData: IConflictData

  suggestedResolution?: {
    action: ResolutionAction
    reason: string
    confidence: number
  }

  status: ConflictStatus
  resolution?: IResolution

  detectedAt: Date
  updatedAt: Date

  metadata?: {
    attemptedAutoResolve?: boolean
    relatedConflicts?: mongoose.Types.ObjectId[]
    affectedPlatforms?: Platform[]
  }

  // instance methods
  resolve: (
    action: ResolutionAction,
    adminId: mongoose.Types.ObjectId,
    notes?: string,
    appliedChanges?: any
  ) => Promise<void>

  autoResolve: (action: ResolutionAction, reason: string) => Promise<void>
  ignore: (adminId: mongoose.Types.ObjectId, reason?: string) => Promise<void>

  isResolved: () => boolean
  isPending: () => boolean
  isCritical: () => boolean
  getDaysOld: () => number
}

// ─────────────────────────────────────────────────────────────
// STATICS INTERFACE (THIS FIXES YOUR ESLINT/TS ERRORS)
// ─────────────────────────────────────────────────────────────

export interface SyncConflictModel extends Model<ISyncConflict> {
  getPendingConflicts: (filters?: {
    severity?: ConflictSeverity
    conflictType?: ConflictType
    userId?: mongoose.Types.ObjectId
    email?: string
    limit?: number
  }) => Promise<ISyncConflict[]>

  getConflictStats: () => Promise<{
    total: number
    pending: number
    resolved: number
    autoResolved: number
    ignored: number
    critical: number
    high: number
  }>

  getConflictsByType: () => Promise<
    { _id: ConflictType; count: number; pending: number }[]
  >

  getCriticalConflicts: (limit?: number) => Promise<ISyncConflict[]>

  getOldPendingConflicts: (daysOld?: number) => Promise<ISyncConflict[]>

  bulkResolve: (
    conflictIds: mongoose.Types.ObjectId[],
    action: ResolutionAction,
    adminId: mongoose.Types.ObjectId,
    notes?: string
  ) => Promise<number>
}

// ─────────────────────────────────────────────────────────────
// SUB-SCHEMAS
// ─────────────────────────────────────────────────────────────

const ConflictDataSchema = new Schema<IConflictData>(
  {
    field: { type: String, required: true },
    existingValue: { type: Schema.Types.Mixed, required: true },
    newValue: { type: Schema.Types.Mixed, required: true },
    platform: {
      type: String,
      enum: ['hotmart', 'curseduca', 'discord', 'system'],
      required: true
    },
    context: { type: Schema.Types.Mixed }
  },
  { _id: false }
)

const SuggestedResolutionSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['MERGED', 'KEPT_EXISTING', 'USED_NEW', 'MANUAL', 'IGNORED'],
      required: true
    },
    reason: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 }
  },
  { _id: false }
)

const ResolutionSchema = new Schema<IResolution>(
  {
    action: {
      type: String,
      enum: ['MERGED', 'KEPT_EXISTING', 'USED_NEW', 'MANUAL', 'IGNORED'],
      required: true
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    resolvedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, maxlength: 1000 },
    appliedChanges: { type: Schema.Types.Mixed }
  },
  { _id: false }
)

const MetadataSchema = new Schema(
  {
    attemptedAutoResolve: { type: Boolean, default: false },
    relatedConflicts: [{ type: Schema.Types.ObjectId, ref: 'SyncConflict' }],
    affectedPlatforms: [
      { type: String, enum: ['hotmart', 'curseduca', 'discord', 'system'] }
    ]
  },
  { _id: false }
)

// ─────────────────────────────────────────────────────────────
// MAIN SCHEMA
// ─────────────────────────────────────────────────────────────

const SyncConflictSchema = new Schema<ISyncConflict>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    syncHistoryId: { type: Schema.Types.ObjectId, ref: 'SyncHistory', required: true, index: true },

    conflictType: {
      type: String,
      enum: [
        'DUPLICATE_EMAIL',
        'DIFFERENT_IDS',
        'MISSING_DATA',
        'INVALID_DATA',
        'PLATFORM_MISMATCH',
        'CLASS_CONFLICT',
        'STATUS_CONFLICT'
      ],
      required: true,
      index: true
    },

    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
      default: 'MEDIUM',
      index: true
    },

    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },

    conflictData: { type: ConflictDataSchema, required: true },
    suggestedResolution: { type: SuggestedResolutionSchema },

    status: {
      type: String,
      enum: ['PENDING', 'RESOLVED', 'IGNORED', 'AUTO_RESOLVED'],
      required: true,
      default: 'PENDING',
      index: true
    },

    resolution: { type: ResolutionSchema },

    detectedAt: { type: Date, required: true, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },

    metadata: { type: MetadataSchema, default: () => ({}) }
  },
  {
    timestamps: false,
    collection: 'syncconflicts'
  }
)

// ─────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────

SyncConflictSchema.index({ status: 1, severity: 1, detectedAt: -1 })
SyncConflictSchema.index({ userId: 1, status: 1 })
SyncConflictSchema.index({ email: 1, conflictType: 1 })
SyncConflictSchema.index({ syncHistoryId: 1, detectedAt: -1 })
SyncConflictSchema.index({ conflictType: 1, status: 1 })

// ─────────────────────────────────────────────────────────────
// INSTANCE METHODS
// ─────────────────────────────────────────────────────────────

SyncConflictSchema.methods.resolve = async function (
  action: ResolutionAction,
  adminId: mongoose.Types.ObjectId,
  notes?: string,
  appliedChanges?: any
): Promise<void> {
  this.status = action === 'IGNORED' ? 'IGNORED' : 'RESOLVED'
  this.resolution = {
    action,
    resolvedBy: adminId,
    resolvedAt: new Date(),
    notes,
    appliedChanges
  }
  this.updatedAt = new Date()
  await this.save()
}

SyncConflictSchema.methods.autoResolve = async function (
  action: ResolutionAction,
  reason: string
): Promise<void> {
  this.status = 'AUTO_RESOLVED'
  this.resolution = {
    action,
    // opcional: idealmente mete isto em config/env em vez de hardcode
    resolvedBy: new mongoose.Types.ObjectId('000000000000000000000000'),
    resolvedAt: new Date(),
    notes: `Auto-resolved: ${reason}`
  }
  this.updatedAt = new Date()

  this.metadata = this.metadata || {}
  this.metadata.attemptedAutoResolve = true

  await this.save()
}

SyncConflictSchema.methods.ignore = async function (
  adminId: mongoose.Types.ObjectId,
  reason?: string
): Promise<void> {
  await this.resolve('IGNORED', adminId, reason)
}

SyncConflictSchema.methods.isResolved = function (): boolean {
  return this.status === 'RESOLVED' || this.status === 'AUTO_RESOLVED'
}
SyncConflictSchema.methods.isPending = function (): boolean {
  return this.status === 'PENDING'
}
SyncConflictSchema.methods.isCritical = function (): boolean {
  return this.severity === 'CRITICAL'
}
SyncConflictSchema.methods.getDaysOld = function (): number {
  const now = new Date()
  const diff = now.getTime() - this.detectedAt.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ─────────────────────────────────────────────────────────────
// STATICS (typed by SyncConflictModel)
// ─────────────────────────────────────────────────────────────

SyncConflictSchema.statics.getPendingConflicts = async function (filters?: {
  severity?: ConflictSeverity
  conflictType?: ConflictType
  userId?: mongoose.Types.ObjectId
  email?: string
  limit?: number
}) {
  const query: any = { status: 'PENDING' }

  if (filters?.severity) query.severity = filters.severity
  if (filters?.conflictType) query.conflictType = filters.conflictType
  if (filters?.userId) query.userId = filters.userId
  if (filters?.email) query.email = filters.email

  return this.find(query)
    .sort({ severity: -1, detectedAt: -1 })
    .limit(filters?.limit || 100)
    .populate('userId', 'name email')
    .populate('syncHistoryId', 'type startedAt')
}

SyncConflictSchema.statics.getConflictStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } },
        autoResolved: { $sum: { $cond: [{ $eq: ['$status', 'AUTO_RESOLVED'] }, 1, 0] } },
        ignored: { $sum: { $cond: [{ $eq: ['$status', 'IGNORED'] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] } }
      }
    }
  ])

  if (stats.length === 0) {
    return { total: 0, pending: 0, resolved: 0, autoResolved: 0, ignored: 0, critical: 0, high: 0 }
  }

  return stats[0]
}

SyncConflictSchema.statics.getConflictsByType = async function () {
  return this.aggregate([
    {
      $group: {
        _id: '$conflictType',
        count: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } }
      }
    },
    { $sort: { count: -1 } }
  ])
}

SyncConflictSchema.statics.getCriticalConflicts = async function (limit: number = 20) {
  return this.find({ status: 'PENDING', severity: 'CRITICAL' })
    .sort({ detectedAt: -1 })
    .limit(limit)
    .populate('userId', 'name email')
}

SyncConflictSchema.statics.getOldPendingConflicts = async function (daysOld: number = 7) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  return this.find({
    status: 'PENDING',
    detectedAt: { $lte: cutoffDate }
  })
    .sort({ severity: -1, detectedAt: 1 })
}

SyncConflictSchema.statics.bulkResolve = async function (
  conflictIds: mongoose.Types.ObjectId[],
  action: ResolutionAction,
  adminId: mongoose.Types.ObjectId,
  notes?: string
): Promise<number> {
  const result = await this.updateMany(
    { _id: { $in: conflictIds }, status: 'PENDING' },
    {
      $set: {
        status: action === 'IGNORED' ? 'IGNORED' : 'RESOLVED',
        resolution: {
          action,
          resolvedBy: adminId,
          resolvedAt: new Date(),
          notes
        },
        updatedAt: new Date()
      }
    }
  )

  return result.modifiedCount || 0
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

SyncConflictSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

SyncConflictSchema.pre('save', function (next) {
  if ((this.status === 'RESOLVED' || this.status === 'AUTO_RESOLVED') && !this.resolution) {
    return next(new Error('Conflitos resolvidos devem ter uma resolução'))
  }
  next()
})

// ─────────────────────────────────────────────────────────────
// MODEL (IMPORTANT PART: <ISyncConflict, SyncConflictModel>)
// ─────────────────────────────────────────────────────────────

const SyncConflict =
  (mongoose.models.SyncConflict as SyncConflictModel) ||
  mongoose.model<ISyncConflict, SyncConflictModel>('SyncConflict', SyncConflictSchema)

export default SyncConflict
