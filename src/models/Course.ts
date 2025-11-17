// ════════════════════════════════════════════════════════════
// 📁 src/models/Course.ts
// Modelo de Course - Meta-configuração por curso
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type TrackingType = 'LOGIN_BASED' | 'ACTION_BASED'
export type CourseCode = 'OGI' | 'CLAREZA' | 'OUTRO'

export interface ILoginThresholds {
  warning: number
  critical: number
}

export interface IProgressThresholds {
  low: number
  medium: number
  high: number
}

export interface IActionThresholds {
  warning: number
  critical: number
  inactive: number
}

export interface IConsistencyThresholds {
  excellent: number
  good: number
}

export interface ITrackingConfig {
  loginThresholds?: ILoginThresholds
  progressThresholds?: IProgressThresholds
  actionType?: 'REPORT_OPEN' | 'LESSON_COMPLETE' | 'MODULE_COMPLETE'
  actionThresholds?: IActionThresholds
  consistencyThresholds?: IConsistencyThresholds
}

export interface IActiveCampaignConfig {
  tagPrefix: string
  listId: string
}

export interface ICourse extends Document {
  code: CourseCode
  name: string
  trackingType: TrackingType
  trackingConfig: ITrackingConfig
  activeCampaignConfig: IActiveCampaignConfig
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

const CourseSchema = new Schema<ICourse>({
  code: {
    type: String,
    enum: ['OGI', 'CLAREZA', 'OUTRO'],
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  trackingType: {
    type: String,
    enum: ['LOGIN_BASED', 'ACTION_BASED'],
    required: true
  },
  trackingConfig: {
    loginThresholds: {
      warning: { type: Number },
      critical: { type: Number }
    },
    progressThresholds: {
      low: { type: Number },
      medium: { type: Number },
      high: { type: Number }
    },
    actionType: {
      type: String,
      enum: ['REPORT_OPEN', 'LESSON_COMPLETE', 'MODULE_COMPLETE']
    },
    actionThresholds: {
      warning: { type: Number },
      critical: { type: Number },
      inactive: { type: Number }
    },
    consistencyThresholds: {
      excellent: { type: Number },
      good: { type: Number }
    }
  },
  activeCampaignConfig: {
    tagPrefix: {
      type: String,
      required: true
    },
    listId: {
      type: String,
      required: true
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'courses'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

CourseSchema.index({ code: 1, isActive: 1 })

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

const Course = mongoose.models.Course || mongoose.model<ICourse>('Course', CourseSchema)

export default Course

