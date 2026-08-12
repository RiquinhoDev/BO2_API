import mongoose, { Schema, type HydratedDocument } from 'mongoose'

// ===== MODELO DE ESTUDANTE =====

export interface IStudent {
  name: string
  email: string
  classId?: string
  className?: string
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  discordIds: string[]
  hotmartId?: string
  enrollmentDate?: Date
  lastActivity?: Date
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type StudentDocument = HydratedDocument<IStudent>

const StudentSchema = new Schema<IStudent>({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  classId: {
    type: String,
    ref: 'Class',
    index: true
  },
  className: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true
  },
  discordIds: [{
    type: String,
    trim: true
  }],
  hotmartId: {
    type: String,
    trim: true,
    index: true
  },
  enrollmentDate: {
    type: Date,
    index: true
  },
  lastActivity: {
    type: Date,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'students'
})

// Índices compostos
StudentSchema.index({ email: 1, status: 1 })
StudentSchema.index({ classId: 1, status: 1 })
StudentSchema.index({ discordIds: 1 })
StudentSchema.index({ name: 'text', email: 'text' })

export const Student = mongoose.model<IStudent>('Student', StudentSchema)
