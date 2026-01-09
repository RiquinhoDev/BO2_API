// src/types/cron.types.ts
import type mongoose from 'mongoose'
import type {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../models/SyncModels/CronJobConfig'

// ──────────────────────────────────────────────────────────────
// DTOs
// ──────────────────────────────────────────────────────────────

export interface CronSyncConfigDTO {
  fullSync?: boolean
  includeProgress?: boolean
  includeTags?: boolean
  batchSize?: number
}

export interface CronNotificationsDTO {
  enabled?: boolean
  emailOnSuccess?: boolean
  emailOnFailure?: boolean
  recipients?: string[]
  webhookUrl?: string
}

export interface CronRetryPolicyDTO {
  maxRetries?: number
  retryDelayMinutes?: number
  exponentialBackoff?: boolean
}

// ✨ Extra (versão “nova” com tag rules)
export interface CronTagRuleOptionsDTO {
  enabled?: boolean
  executeAllRules?: boolean
  runInParallel?: boolean
  stopOnError?: boolean
}

export interface CreateCronJobDTO {
  name: string
  description: string
  syncType: SyncType
  cronExpression: string
  timezone?: string

  syncConfig?: CronSyncConfigDTO

  // ✨ opcionais (para jobs que suportam regras de tags)
  tagRules?: mongoose.Types.ObjectId[]
  tagRuleOptions?: CronTagRuleOptionsDTO

  notifications?: CronNotificationsDTO
  retryPolicy?: CronRetryPolicyDTO

  createdBy: mongoose.Types.ObjectId
}

export interface UpdateCronJobDTO {
  name?: string
  description?: string
  cronExpression?: string
  timezone?: string
  enabled?: boolean

  syncConfig?: Partial<CronSyncConfigDTO>
  tagRules?: mongoose.Types.ObjectId[]
  tagRuleOptions?: Partial<CronTagRuleOptionsDTO>

  notifications?: Partial<CronNotificationsDTO>
  retryPolicy?: Partial<CronRetryPolicyDTO>
}

// ──────────────────────────────────────────────────────────────
// Execution Result
// ──────────────────────────────────────────────────────────────

export interface CronExecutionResult {
  success: boolean
  duration: number
  stats: ILastRunStats
  errorMessage?: string
}

// ──────────────────────────────────────────────────────────────
// Daily Pipeline Types
// ──────────────────────────────────────────────────────────────

export interface PipelineStepResult {
  success: boolean
  duration: number
  stats: any
  error?: string
}

export interface DailyPipelineResult {
  success: boolean
  duration: number
  completedAt: Date
  steps: {
    syncHotmart: PipelineStepResult
    syncCursEduca: PipelineStepResult
    preCreateTags: PipelineStepResult
    recalcEngagement: PipelineStepResult
    evaluateTagRules: PipelineStepResult
  }
  errors: string[]
  summary: {
    totalUsers: number
    totalUserProducts: number
    engagementUpdated: number
    tagsApplied: number
  }
}

// ──────────────────────────────────────────────────────────────
// Re-export useful model types
// ──────────────────────────────────────────────────────────────

export type { ICronJobConfig, ILastRunStats, SyncType }
