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
 * Métricas produzidas pelos vários steps do pipeline.
 * São opcionais porque cada step expõe apenas o seu subconjunto.
 */
export interface PipelineStepStats {
  total?: number
  totalTags?: number
  created?: number
  existing?: number
  cached?: number
  failed?: number
  successful?: number
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
  /**
   * O que o "1o" faz hoje: le as plataformas e recalcula metricas.
   *
   * Ja teve mais tres passos — preCreateTags, evaluateTagRules e
   * syncTestimonialTags — que eram o motor de tags de Janeiro. Sairam a 11 e
   * 12/09/2026 e nao voltam. Quem trata de tags e o renewalPipeline, e so a
   * quem tem um acontecimento por tratar.
   */
  steps: {
    syncHotmart: PipelineStepResult
    syncCursEduca: PipelineStepResult
    recalcEngagement: PipelineStepResult
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
