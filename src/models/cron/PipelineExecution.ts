// ════════════════════════════════════════════════════════════
// 📋 PIPELINE EXECUTION MODEL
// ════════════════════════════════════════════════════════════
// Modelo para histórico detalhado de execuções do Daily Pipeline
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'
import type { PipelineStepStats } from '../../types/cron.types'

export interface IPipelineStepStats {
  success: boolean
  duration: number
  stats: PipelineStepStats
  error?: string
}

export interface IPipelineExecution extends Document {
  executionType: 'automatic' | 'manual'
  status: 'success' | 'partial' | 'failed' | 'running'
  startTime: Date
  endTime?: Date
  duration: number

  steps: {
    syncHotmart: IPipelineStepStats
    syncCursEduca: IPipelineStepStats
    preCreateTags: IPipelineStepStats
    recalcEngagement: IPipelineStepStats
    evaluateTagRules: IPipelineStepStats
  }

  summary: {
    totalUsers: number
    totalUserProducts: number
    engagementUpdated: number
    tagsApplied: number
  }

  errorMessages: string[]
  executedBy?: mongoose.Types.ObjectId
  triggeredBy?: string
}

const PipelineStepStatsSchema = new Schema({
  success: { type: Boolean, required: true },
  duration: { type: Number, required: true },
  stats: { type: Schema.Types.Mixed },
  error: { type: String }
}, { _id: false })

const PipelineExecutionSchema = new Schema(
  {
    executionType: {
      type: String,
      enum: ['automatic', 'manual'],
      required: true,
      default: 'automatic'
    },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed', 'running'],
      required: true,
      default: 'running'
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now
    },
    endTime: {
      type: Date
    },
    duration: {
      type: Number,
      required: true,
      default: 0
    },
    steps: {
      syncHotmart: { type: PipelineStepStatsSchema, required: true },
      syncCursEduca: { type: PipelineStepStatsSchema, required: true },
      preCreateTags: { type: PipelineStepStatsSchema, required: true },
      recalcEngagement: { type: PipelineStepStatsSchema, required: true },
      evaluateTagRules: { type: PipelineStepStatsSchema, required: true }
    },
    summary: {
      totalUsers: { type: Number, default: 0 },
      totalUserProducts: { type: Number, default: 0 },
      engagementUpdated: { type: Number, default: 0 },
      tagsApplied: { type: Number, default: 0 }
    },
    errorMessages: [{ type: String }],
    executedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    triggeredBy: {
      type: String
    }
  },
  {
    timestamps: true
  }
)

PipelineExecutionSchema.index({ startTime: -1 })
PipelineExecutionSchema.index({ status: 1, startTime: -1 })
PipelineExecutionSchema.index({ executionType: 1, startTime: -1 })

PipelineExecutionSchema.methods.markAsSuccess = function() {
  this.status = 'success'
  this.endTime = new Date()
  return this.save()
}

PipelineExecutionSchema.methods.markAsFailed = function(errorMessage: string) {
  this.status = 'failed'
  this.endTime = new Date()
  if (errorMessage) {
    this.errorMessages.push(errorMessage)
  }
  return this.save()
}

PipelineExecutionSchema.methods.markAsPartial = function() {
  this.status = 'partial'
  this.endTime = new Date()
  return this.save()
}

PipelineExecutionSchema.statics.getLastExecution = function() {
  return this.findOne()
    .sort({ startTime: -1 })
    .lean()
}

PipelineExecutionSchema.statics.getLastSuccessfulExecution = function() {
  return this.findOne({ status: 'success' })
    .sort({ startTime: -1 })
    .lean()
}

PipelineExecutionSchema.statics.getExecutionHistory = function(limit: number = 10) {
  return this.find()
    .sort({ startTime: -1 })
    .limit(limit)
    .lean()
}

PipelineExecutionSchema.statics.getExecutionStats = function(days: number = 7) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  return this.aggregate([
    {
      $match: {
        startTime: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalExecutions: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        partialCount: {
          $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] }
        },
        avgDuration: { $avg: '$duration' },
        totalUsersProcessed: { $sum: '$summary.totalUsers' },
        totalTagsApplied: { $sum: '$summary.tagsApplied' }
      }
    }
  ])
}

export default mongoose.model<IPipelineExecution>('PipelineExecution', PipelineExecutionSchema)
