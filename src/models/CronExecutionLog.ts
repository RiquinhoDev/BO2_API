// =====================================================
// 📁 src/models/CronExecutionLog.ts
// Model para registar execuções dos CRON jobs
// =====================================================

import mongoose, { Schema, Document } from 'mongoose'

export interface ICronExecutionLog extends Document {
  executionId: string
  type: 'daily-evaluation' | 'manual-test'
  status: 'success' | 'failed' | 'running'
  startedAt: Date
  finishedAt?: Date
  duration?: number
  results: {
    totalCourses?: number
    totalStudents?: number
    tagsApplied?: number
    tagsRemoved?: number
    errors?: any[]
    error?: string
  }
}

const CronExecutionLogSchema = new Schema<ICronExecutionLog>({
  executionId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  status: { type: String, required: true },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date },
  duration: { type: Number },
  results: { type: Schema.Types.Mixed }
}, {
  timestamps: true
})

export default mongoose.model<ICronExecutionLog>('CronExecutionLog', CronExecutionLogSchema)
