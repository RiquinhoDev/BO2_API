// src/models/UserHistory.ts
import mongoose, { Schema, model, type Model } from 'mongoose'

export interface IUserHistory {
  userId: mongoose.Types.ObjectId
  userEmail: string
  changeType: 'CLASS_CHANGE' | 'EMAIL_CHANGE' | 'MANUAL_EDIT' | 'PLATFORM_UPDATE' | 'STATUS_CHANGE' | 'INACTIVATION'
  previousValue: Record<string, any>
  newValue: Record<string, any>
  platform?: 'hotmart' | 'curseduca' | 'discord' | 'system'
  field?: string
  action?: 'create' | 'update' | 'delete' | 'sync'
  changeDate: Date
  timestamp?: Date
  source: 'HOTMART_SYNC' | 'CURSEDUCA_SYNC' | 'MANUAL' | 'SYSTEM'
  syncId?: mongoose.Types.ObjectId
  changedBy?: string
  adminId?: string
  reason?: string
  notes?: string
  metadata?: any
}

export type UserHistoryModelType = Model<IUserHistory>

const userHistorySchema = new Schema<IUserHistory>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    userEmail: { type: String, required: true, index: true },
    changeType: {
      type: String,
      enum: ['CLASS_CHANGE', 'EMAIL_CHANGE', 'MANUAL_EDIT', 'PLATFORM_UPDATE', 'STATUS_CHANGE', 'INACTIVATION'],
      required: true,
      index: true
    },

    // ✅ mais correcto do que ter "type: Mixed" lá dentro (isso cria um campo "type")
    previousValue: { type: Schema.Types.Mixed, default: {} },
    newValue: { type: Schema.Types.Mixed, default: {} },

    platform: { type: String, enum: ['hotmart', 'curseduca', 'discord', 'system'], index: true },
    field: String,
    action: { type: String, enum: ['create', 'update', 'delete', 'sync'] },

    timestamp: { type: Date, default: Date.now, index: true },
    adminId: String,
    metadata: Schema.Types.Mixed,

    changeDate: { type: Date, default: Date.now, index: true },
    source: { type: String, enum: ['HOTMART_SYNC', 'CURSEDUCA_SYNC', 'MANUAL', 'SYSTEM'], required: true, index: true },
    syncId: { type: Schema.Types.ObjectId, ref: 'SyncHistory' },
    changedBy: String,

    reason: String,
    notes: String
  },
  { timestamps: true, collection: 'userhistories' }
)

// índices...
userHistorySchema.index({ userId: 1, changeDate: -1 })
userHistorySchema.index({ userEmail: 1, changeDate: -1 })
userHistorySchema.index({ changeType: 1, changeDate: -1 })
userHistorySchema.index({ platform: 1, timestamp: -1 })
userHistorySchema.index({ userId: 1, platform: 1, timestamp: -1 })

// ✅ O ponto-chave: força o cast do model existente para o tipo certo
const UserHistory: UserHistoryModelType =
  (mongoose.models.UserHistory as UserHistoryModelType) ??
  model<IUserHistory>('UserHistory', userHistorySchema)

export default UserHistory

export function ensureUserHistoryModel(): UserHistoryModelType {
  return (mongoose.models.UserHistory as UserHistoryModelType) ?? UserHistory
}
