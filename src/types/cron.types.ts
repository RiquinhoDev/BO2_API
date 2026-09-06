// src/types/cron.types.ts
import type mongoose from 'mongoose'
import type {
  ICronJobConfig,
  ILastRunStats,
  SyncType
} from '../models/SyncModels/CronJobConfig'
import type { CronExecutionPhaseHooks } from '../services/cron/scheduler/executionPhases'

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
  dryRun?: boolean
  plan?: DailyPipelinePlan | CronExecutionCleanupPlan
}

export interface DailyPipelinePlan {
  operation: 'daily-pipeline'
  dryRun: true
  limit: number
  withinLimit: boolean
  activeUserProducts: number
  testimonialUsers: number
  activeTagRules: number
  configuredProducts: {
    hotmart: number
    curseduca: number
  }
  steps: readonly string[]
}

export interface CronExecutionCleanupPlan {
  operation: 'cron-execution-cleanup'
  dryRun: true
  totalBefore: number
  eligible: number
  wouldDelete: number
  minimumToKeep: number
  limit: number
  truncated: boolean
  /** Lower bound of candidates beyond the bounded sample; never an exact count. */
  remaining: number
}

export interface DailyPipelineOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
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
  dryRun?: boolean
  plan?: DailyPipelinePlan
}

export type { ICronJobConfig, ILastRunStats, SyncType }
