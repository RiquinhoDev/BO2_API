// ════════════════════════════════════════════════════════════
// 📁 src/models/UserAction.ts
// Modelo de UserAction - Tracking de ações (Clareza)
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type ActionType = 'REPORT_OPENED' | 'LESSON_COMPLETED' | 'LOGIN' | 'MODULE_COMPLETED'
export type ActionSource = 'CURSEDUCA' | 'HOTMART' | 'MANUAL'

export interface IActionData {
  reportId?: string
  reportName?: string
  lessonId?: string
  moduleId?: string
}

export interface IUserAction extends Document {
  userId: mongoose.Types.ObjectId
  courseId: mongoose.Types.ObjectId
  actionType: ActionType
  actionData: IActionData
  timestamp: Date
  source: ActionSource
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const ActionDataSchema = new Schema<IActionData>({
  reportId: { type: String },
  reportName: { type: String },
  lessonId: { type: String },
  moduleId: { type: String }
}, { _id: false })

const UserActionSchema = new Schema<IUserAction>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  actionType: {
    type: String,
    enum: ['REPORT_OPENED', 'LESSON_COMPLETED', 'LOGIN', 'MODULE_COMPLETED'],
    required: true,
    index: true
  },
  actionData: {
    type: ActionDataSchema,
    default: {}
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    enum: ['CURSEDUCA', 'HOTMART', 'MANUAL'],
    required: true
  }
}, {
  timestamps: true,
  collection: 'useractions'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES COMPOSTOS
// ─────────────────────────────────────────────────────────────

UserActionSchema.index({ userId: 1, timestamp: -1 })
UserActionSchema.index({ userId: 1, courseId: 1, timestamp: -1 })
UserActionSchema.index({ courseId: 1, actionType: 1, timestamp: -1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

UserActionSchema.statics.getLastActionByUser = async function(
  userId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId,
  actionType?: ActionType
) {
  const query: any = { userId, courseId }
  if (actionType) query.actionType = actionType
  
  return this.findOne(query).sort({ timestamp: -1 })
}

UserActionSchema.statics.countActionsInPeriod = async function(
  userId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId,
  days: number,
  actionType?: ActionType
) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const query: any = {
    userId,
    courseId,
    timestamp: { $gte: startDate }
  }
  if (actionType) query.actionType = actionType
  
  return this.countDocuments(query)
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const UserAction = mongoose.models.UserAction || 
  mongoose.model<IUserAction>('UserAction', UserActionSchema)

export default UserAction

