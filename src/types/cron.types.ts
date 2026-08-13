// src/types/cron.types.ts
import type mongoose from 'mongoose'
import type {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../models/SyncModels/CronJobConfig'

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

export interface CronExecutionResult {
  success: boolean
  duration: number
  stats: ILastRunStats
  errorMessage?: string
}

/**
 * Métricas de resumo que os pipelines leem transversalmente para logging.
 * Os produtores podem expor campos adicionais; não exigimos index signature.
 */
export interface PipelineStepStats {
  total?: number
  totalTags?: number
  updated?: number
  tagsApplied?: number
  tagsRemoved?: number
  synced?: number
}

export interface PipelineStepResult {
  success: boolean
  duration: number
  stats: PipelineStepStats
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
    syncTestimonialTags: PipelineStepResult
  }
  errors: string[]
  summary: {
    totalUsers: number
    totalUserProducts: number
    engagementUpdated: number
    tagsApplied: number
  }
}

export type { ICronJobConfig, ILastRunStats, SyncType }
