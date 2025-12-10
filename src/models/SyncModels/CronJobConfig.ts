// ════════════════════════════════════════════════════════════
// 📁 src/models/CronJobConfig.ts
// Model: CRON Job Configuration
// Gestão de sincronizações automáticas agendadas
// ════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose'
import { ICronJobConfigModel } from '../../services/syncUtilziadoresServices/cronManagement.service'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export type SyncType = 'hotmart' | 'curseduca' | 'discord' | 'all'
export type JobStatus = 'success' | 'failed' | 'partial' | 'running'
export type TriggerType = 'MANUAL' | 'CRON' | 'WEBHOOK'

export interface IScheduleConfig {
  cronExpression: string          // "0 2 * * *" (02:00 todos os dias)
  timezone: string                // "Europe/Lisbon"
  enabled: boolean
}

export interface ISyncConfig {
  fullSync: boolean               // true = tudo, false = apenas updates
  includeProgress: boolean        // Atualizar progresso?
  includeTags: boolean            // Atualizar tags AC?
  batchSize: number               // Tamanho do lote (100-1000)
}

export interface INotificationConfig {
  enabled: boolean
  emailOnSuccess: boolean
  emailOnFailure: boolean
  recipients: string[]            // ["admin@example.com"]
  webhookUrl?: string             // Slack/Discord webhook
}

export interface IRetryPolicy {
  maxRetries: number              // 3
  retryDelayMinutes: number       // 30
  exponentialBackoff: boolean
}

export interface ILastRunStats {
  total: number
  inserted: number
  updated: number
  errors: number
  skipped: number
}

export interface ILastRun {
  startedAt: Date
  completedAt?: Date
  status: JobStatus
  duration: number                // segundos
  stats: ILastRunStats
  errorMessage?: string
  triggeredBy: TriggerType
}

export interface ICronJobConfig extends Document {
  _id: mongoose.Types.ObjectId
  
  // Identificação
  name: string
  description: string
  
  // Tipo de sync
  syncType: SyncType
  
  // Agendamento
  schedule: IScheduleConfig
  
  // Configuração do sync
  syncConfig: ISyncConfig
  
  // Notificações
  notifications: INotificationConfig
  
  // Retry policy
  retryPolicy: IRetryPolicy
  
  // Tracking
  lastRun?: ILastRun
  nextRun?: Date
  
  // Audit
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
  isActive: boolean
  
  // Statistics
  totalRuns: number
  successfulRuns: number
  failedRuns: number

  // 👇 MÉTODOS DE INSTÂNCIA
  calculateNextRun(): Date
  recordExecution(
    stats: ILastRunStats,
    status: JobStatus,
    duration: number,
    triggeredBy: TriggerType,
    errorMessage?: string
  ): Promise<void>
  getSuccessRate(): number
}


// ─────────────────────────────────────────────────────────────
// SUB-SCHEMAS
// ─────────────────────────────────────────────────────────────

const ScheduleConfigSchema = new Schema<IScheduleConfig>({
  cronExpression: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        // Validação básica de cron expression (5 campos)
        const parts = v.trim().split(/\s+/)
        return parts.length === 5
      },
      message: 'Cron expression inválida (deve ter 5 campos: min hour day month weekday)'
    }
  },
  timezone: {
    type: String,
    required: true,
    default: 'Europe/Lisbon'
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  }
}, { _id: false })

const SyncConfigSchema = new Schema<ISyncConfig>({
  fullSync: {
    type: Boolean,
    required: true,
    default: true
  },
  includeProgress: {
    type: Boolean,
    required: true,
    default: true
  },
  includeTags: {
    type: Boolean,
    required: true,
    default: false
  },
  batchSize: {
    type: Number,
    required: true,
    default: 500,
    min: 50,
    max: 1000
  }
}, { _id: false })

const NotificationConfigSchema = new Schema<INotificationConfig>({
  enabled: {
    type: Boolean,
    required: true,
    default: false
  },
  emailOnSuccess: {
    type: Boolean,
    default: false
  },
  emailOnFailure: {
    type: Boolean,
    default: true
  },
  recipients: {
    type: [String],
    default: [],
    validate: {
      validator: function(v: string[]) {
        // Validar emails
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return v.every(email => emailRegex.test(email))
      },
      message: 'Lista contém emails inválidos'
    }
  },
  webhookUrl: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true // Opcional
        return /^https?:\/\/.+/.test(v)
      },
      message: 'Webhook URL inválida'
    }
  }
}, { _id: false })

const RetryPolicySchema = new Schema<IRetryPolicy>({
  maxRetries: {
    type: Number,
    required: true,
    default: 3,
    min: 0,
    max: 10
  },
  retryDelayMinutes: {
    type: Number,
    required: true,
    default: 30,
    min: 5,
    max: 1440 // 24h
  },
  exponentialBackoff: {
    type: Boolean,
    default: true
  }
}, { _id: false })

const LastRunStatsSchema = new Schema<ILastRunStats>({
  total: { type: Number, default: 0 },
  inserted: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  errors: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 }
}, { _id: false })

const LastRunSchema = new Schema<ILastRun>({
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'partial', 'running'],
    required: true
  },
  duration: {
    type: Number,
    default: 0
  },
  stats: {
    type: LastRunStatsSchema,
    required: true
  },
  errorMessage: {
    type: String
  },
  triggeredBy: {
    type: String,
    enum: ['MANUAL', 'CRON', 'WEBHOOK'],
    required: true
  }
}, { _id: false })

// ─────────────────────────────────────────────────────────────
// SCHEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────

const CronJobConfigSchema = new Schema<ICronJobConfig, ICronJobConfigModel>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  syncType: {
    type: String,
    enum: ['hotmart', 'curseduca', 'discord', 'all'],
    required: true,
    index: true
  },
  schedule: {
    type: ScheduleConfigSchema,
    required: true
  },
  syncConfig: {
    type: SyncConfigSchema,
    required: true
  },
  notifications: {
    type: NotificationConfigSchema,
    default: () => ({
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: true,
      recipients: []
    })
  },
  retryPolicy: {
    type: RetryPolicySchema,
    default: () => ({
      maxRetries: 3,
      retryDelayMinutes: 30,
      exponentialBackoff: true
    })
  },
  lastRun: {
    type: LastRunSchema
  },
  nextRun: {
    type: Date,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  totalRuns: {
    type: Number,
    default: 0
  },
  successfulRuns: {
    type: Number,
    default: 0
  },
  failedRuns: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'cronjobconfigs'
})

// ─────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────

CronJobConfigSchema.index({ name: 1 }, { unique: true })
CronJobConfigSchema.index({ syncType: 1, 'schedule.enabled': 1 })
CronJobConfigSchema.index({ nextRun: 1 })
CronJobConfigSchema.index({ isActive: 1, 'schedule.enabled': 1 })
CronJobConfigSchema.index({ createdBy: 1, createdAt: -1 })

// ─────────────────────────────────────────────────────────────
// MÉTODOS DE INSTÂNCIA
// ─────────────────────────────────────────────────────────────

CronJobConfigSchema.methods.calculateNextRun = function(): Date {
  // Este método será implementado no service usando node-cron ou parser-cron
  // Por agora retornamos uma data placeholder
  const now = new Date()
  return new Date(now.getTime() + 24 * 60 * 60 * 1000) // +24h
}

CronJobConfigSchema.methods.recordExecution = async function(
  stats: ILastRunStats,
  status: JobStatus,
  duration: number,
  triggeredBy: TriggerType,
  errorMessage?: string
): Promise<void> {
  const completedAt = new Date()
  
  this.lastRun = {
    startedAt: new Date(completedAt.getTime() - duration * 1000),
    completedAt,
    status,
    duration,
    stats,
    errorMessage,
    triggeredBy
  }
  
  this.totalRuns += 1
  
  if (status === 'success') {
    this.successfulRuns += 1
  } else if (status === 'failed') {
    this.failedRuns += 1
  }
  
  // Calcular próxima execução
  this.nextRun = this.calculateNextRun()
  
  await this.save()
}

CronJobConfigSchema.methods.getSuccessRate = function(): number {
  if (this.totalRuns === 0) return 0
  return (this.successfulRuns / this.totalRuns) * 100
}

// ─────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────

CronJobConfigSchema.statics.getActiveJobs = async function() {
  return this.find({
    isActive: true,
    'schedule.enabled': true
  }).sort({ nextRun: 1 })
}

CronJobConfigSchema.statics.getJobsByType = async function(syncType: SyncType) {
  return this.find({ syncType, isActive: true }).sort({ name: 1 })
}

CronJobConfigSchema.statics.getJobsDueForExecution = async function() {
  const now = new Date()
  return this.find({
    isActive: true,
    'schedule.enabled': true,
    nextRun: { $lte: now }
  })
}

// ─────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────

const CronJobConfig =
  (mongoose.models.CronJobConfig as ICronJobConfigModel) ||
  mongoose.model<ICronJobConfig, ICronJobConfigModel>(
    'CronJobConfig',
    CronJobConfigSchema
  )

export default CronJobConfig
export { ICronJobConfigModel }
