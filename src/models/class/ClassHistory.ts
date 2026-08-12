import mongoose, { Schema, Document } from 'mongoose'

// ===== MODELO DE HISTÓRICO DE TURMAS =====

export interface IClassHistory extends Document {
  studentId: string
  studentEmail: string
  studentName: string
  classId: string
  className: string
  fromClassId?: string
  fromClassName?: string
  action: 'MOVE' | 'ENROLL' | 'REMOVE' | 'REACTIVATE'
  reason?: string
  dateMoved: Date
  performedBy?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

const ClassHistorySchema = new Schema<IClassHistory>({
  studentId: {
    type: String,
    required: true,
    index: true
  },
  studentEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  classId: {
    type: String,
    required: true,
    index: true
  },
  className: {
    type: String,
    required: true,
    trim: true
  },
  fromClassId: {
    type: String,
    index: true
  },
  fromClassName: {
    type: String,
    trim: true
  },
  action: {
    type: String,
    enum: ['MOVE', 'ENROLL', 'REMOVE', 'REACTIVATE'],
    required: true,
    index: true
  },
  reason: {
    type: String,
    trim: true
  },
  dateMoved: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  performedBy: {
    type: String,
    trim: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'class_history'
})

// Índices compostos para consultas otimizadas
ClassHistorySchema.index({ studentId: 1, dateMoved: -1 })
ClassHistorySchema.index({ classId: 1, dateMoved: -1 })
ClassHistorySchema.index({ studentEmail: 1, dateMoved: -1 })
ClassHistorySchema.index({ dateMoved: -1 })
ClassHistorySchema.index({ action: 1, dateMoved: -1 })

export const ClassHistory: mongoose.Model<IClassHistory> = mongoose.models.ClassHistory || mongoose.model<IClassHistory>('ClassHistory', ClassHistorySchema)
