// ================================================================
// 📋 CRON EXECUTION MODEL
// ================================================================
// Modelo para histórico de execuções de CRON jobs
// ================================================================

import mongoose, { Schema, Document } from 'mongoose'

export interface ICronExecution extends Document {
  cronName: string
  executionType: 'automatic' | 'manual'
  status: 'success' | 'error' | 'running'
  startTime: Date
  endTime?: Date
  duration?: number // Milissegundos
  tagsApplied?: number
  emailsSynced?: number
  studentsProcessed?: number
  errorMessage?: string
  executedBy?: string // User ID se manual
}

const CronExecutionSchema: Schema = new Schema(
  {
    cronName: {
      type: String,
      required: true,
    },
    executionType: {
      type: String,
      enum: ['automatic', 'manual'],
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'error', 'running'],
      required: true,
      default: 'running',
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    duration: {
      type: Number, // Milissegundos
    },
    tagsApplied: {
      type: Number,
      default: 0,
    },
    emailsSynced: {
      type: Number,
      default: 0,
    },
    studentsProcessed: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
    },
    executedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
)

// Index para queries rápidas
CronExecutionSchema.index({ cronName: 1, startTime: -1 })

export default mongoose.model<ICronExecution>('CronExecution', CronExecutionSchema)

