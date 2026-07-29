import type {
  ICronJobConfig,
  ILastRun,
} from '../../models/SyncModels/CronJobConfig'
import type { ICronExecution } from '../../models/cron/CronExecution'
import type {
  CronExecutionView,
  CronJobView,
} from './cronTagsCompatibility.types'

function mapLastRun(lastRun: ILastRun): CronJobView['lastRun'] {
  return {
    startedAt: lastRun.startedAt,
    completedAt: lastRun.completedAt,
    status: lastRun.status,
    duration: lastRun.duration,
    stats: {
      total: lastRun.stats.total,
      inserted: lastRun.stats.inserted,
      updated: lastRun.stats.updated,
      errors: lastRun.stats.errors,
      skipped: lastRun.stats.skipped,
    },
    errorMessage: lastRun.errorMessage,
    triggeredBy: lastRun.triggeredBy,
  }
}

export function mapCronJob(job: ICronJobConfig): CronJobView {
  return {
    _id: job._id.toString(),
    name: job.name,
    description: job.description,
    syncType: job.syncType,
    schedule: {
      cronExpression: job.schedule.cronExpression,
      timezone: job.schedule.timezone,
      enabled: job.schedule.enabled,
    },
    syncConfig: {
      fullSync: job.syncConfig.fullSync,
      includeProgress: job.syncConfig.includeProgress,
      includeTags: job.syncConfig.includeTags,
      batchSize: job.syncConfig.batchSize,
    },
    tagRules: job.tagRules.map(tagRule => tagRule.toString()),
    tagRuleOptions: {
      enabled: job.tagRuleOptions.enabled,
      executeAllRules: job.tagRuleOptions.executeAllRules,
      runInParallel: job.tagRuleOptions.runInParallel,
      stopOnError: job.tagRuleOptions.stopOnError,
    },
    notifications: {
      enabled: job.notifications.enabled,
      emailOnSuccess: job.notifications.emailOnSuccess,
      emailOnFailure: job.notifications.emailOnFailure,
      recipients: [...job.notifications.recipients],
      webhookUrl: job.notifications.webhookUrl,
    },
    retryPolicy: {
      maxRetries: job.retryPolicy.maxRetries,
      retryDelayMinutes: job.retryPolicy.retryDelayMinutes,
      exponentialBackoff: job.retryPolicy.exponentialBackoff,
    },
    lastRun: job.lastRun ? mapLastRun(job.lastRun) : undefined,
    nextRun: job.nextRun,
    createdBy: job.createdBy.toString(),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    isActive: job.isActive,
    totalRuns: job.totalRuns,
    successfulRuns: job.successfulRuns,
    failedRuns: job.failedRuns,
  }
}

export function mapCronExecution(
  execution: ICronExecution,
): CronExecutionView {
  return {
    _id: execution._id.toString(),
    cronName: execution.cronName,
    executionType: execution.executionType,
    status: execution.status,
    startTime: execution.startTime,
    endTime: execution.endTime,
    duration: execution.duration,
    tagsApplied: execution.tagsApplied ?? 0,
    emailsSynced: execution.emailsSynced ?? 0,
    studentsProcessed: execution.studentsProcessed ?? 0,
    errorMessage: execution.errorMessage,
    executedBy: execution.executedBy?.toString(),
  }
}
