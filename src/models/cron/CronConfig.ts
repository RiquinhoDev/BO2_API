// ================================================================
// 🕐 CRON CONFIG MODEL
// ================================================================
// Modelo para configuração de jobs CRON (horário, status, etc)
// ================================================================

import mongoose, { Schema, Document } from 'mongoose'

export interface ICronConfig extends Document {
  name: string
  cronExpression: string // Ex: "0 2 * * *" (2h da manhã)
  isActive: boolean
  lastRun?: Date
  nextRun?: Date
  averageDuration?: number // Milissegundos
  createdAt: Date
  updatedAt: Date
}

const CronConfigSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['TAG_RULES_SYNC'], // Pode adicionar mais tipos depois
    },
    cronExpression: {
      type: String,
      required: true,
      default: '0 2 * * *', // 2h da manhã todos os dias
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastRun: {
      type: Date,
    },
    nextRun: {
      type: Date,
    },
    averageDuration: {
      type: Number, // Milissegundos
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<ICronConfig>('CronConfig', CronConfigSchema)

