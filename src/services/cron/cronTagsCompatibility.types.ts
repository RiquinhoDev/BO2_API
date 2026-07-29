import type {
  JobStatus,
  SyncType,
  TriggerType,
} from '../../models/SyncModels/CronJobConfig'

export interface CronJobView {
  _id: string
  name: string
  description: string
  syncType: SyncType
  schedule: {
    cronExpression: string
    timezone: string
    enabled: boolean
  }
  syncConfig: {
    fullSync: boolean
    includeProgress: boolean
    includeTags: boolean
    batchSize: number
  }
  tagRules: string[]
  tagRuleOptions: {
    enabled: boolean
    executeAllRules: boolean
    runInParallel: boolean
    stopOnError: boolean
  }
  notifications: {
    enabled: boolean
    emailOnSuccess: boolean
    emailOnFailure: boolean
    recipients: string[]
    webhookUrl?: string
  }
  retryPolicy: {
    maxRetries: number
    retryDelayMinutes: number
    exponentialBackoff: boolean
  }
  lastRun?: {
    startedAt: Date
    completedAt?: Date
    status: JobStatus
    duration: number
    stats: {
      total: number
      inserted: number
      updated: number
      errors: number
      skipped: number
    }
    errorMessage?: string
    triggeredBy: TriggerType
  }
  isActive: boolean
  nextRun?: Date
  createdBy: string
  createdAt: Date
  updatedAt: Date
  totalRuns: number
  successfulRuns: number
  failedRuns: number
}

export interface CronExecutionView {
  _id: string
  cronName: string
  executionType: 'automatic' | 'manual'
  status: 'success' | 'error' | 'running'
  startTime: Date
  endTime?: Date
  duration?: number
  tagsApplied: number
  emailsSynced: number
  studentsProcessed: number
  errorMessage?: string
  executedBy?: string
}

export interface CronStatistics {
  totalExecutions: number
  successRate: number
  avgDuration: number
}

export interface ExecutionQuery {
  cronName?: string
  limit: number
}

export interface StatisticsQuery {
  cronName: string
  since: Date
}

export interface CronTagsRepositoryPort {
  findJobByName(name: string): Promise<CronJobView | null>
  listActiveJobs(): Promise<CronJobView[]>
  listExecutions(query: ExecutionQuery): Promise<CronExecutionView[]>
  getStatistics(query: StatisticsQuery): Promise<CronStatistics>
}

export interface CronTagsSchedulerPort {
  getJobById(id: string): Promise<CronJobView | null>
  getNextExecutions(expression: string, count: number): Date[]
  isActive(): boolean
  updateJob(
    id: string,
    updates: {
      cronExpression: string
      enabled: boolean
    },
  ): Promise<CronJobView>
}

export interface CronTagsCompatibilityDependencies {
  repository: CronTagsRepositoryPort
  scheduler: CronTagsSchedulerPort
  now?: () => Date
}
