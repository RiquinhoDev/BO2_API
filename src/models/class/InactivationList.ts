import mongoose, { Schema, Document } from 'mongoose'

// ===== MODELO DE LISTAS DE INATIVAÇÃO =====

export interface IInactivationList extends Document {
  name: string
  description?: string
  classIds: string[]
  criteria?: Record<string, any>
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'REVERTED'
  scheduledDate?: Date
  executedDate?: Date
  revertedDate?: Date
  studentsAffected: number
  createdBy?: string
  revertedBy?: string
  revertReason?: string
  results?: {
    success: number
    errors: number
    details: any[]
  }
  createdAt: Date
  updatedAt: Date
}

const InactivationListSchema = new Schema<IInactivationList>({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  classIds: [{
    type: String,
    required: true
  }],
  criteria: {
    type: Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REVERTED'],
    default: 'PENDING',
    index: true
  },
  scheduledDate: {
    type: Date,
    index: true
  },
  executedDate: {
    type: Date,
    index: true
  },
  revertedDate: {
    type: Date
  },
  studentsAffected: {
    type: Number,
    default: 0,
    min: 0
  },
  createdBy: {
    type: String,
    trim: true
  },
  revertedBy: {
    type: String,
    trim: true
  },
  revertReason: {
    type: String,
    trim: true
  },
  results: {
    success: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    details: [Schema.Types.Mixed]
  }
}, {
  timestamps: true,
  collection: 'inactivation_lists'
})

// Índices
InactivationListSchema.index({ status: 1, createdAt: -1 })
InactivationListSchema.index({ scheduledDate: 1 })
InactivationListSchema.index({ classIds: 1 })

export const InactivationList = mongoose.model<IInactivationList>('InactivationList', InactivationListSchema)
