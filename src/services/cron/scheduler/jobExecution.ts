import { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import { CronExecutionResult } from '../../../types/cron.types'
import { CronDispatchJob, CronDispatchResult } from './jobDispatcher'
import { CronNotificationJob } from './notificationPort'

export type CronTrigger = 'CRON' | 'MANUAL'

export interface CronExecutionJob extends CronNotificationJob, CronDispatchJob {
  recordExecution(
    stats: ILastRunStats,
    status: 'success' | 'failed',
    duration: number,
    triggeredBy: CronTrigger,
    errorMessage?: string
  ): Promise<void>
}

export interface CronHistoryEntry {
  jobName: string
  stats: ILastRunStats
  status: 'success' | 'error'
  duration: number
  triggeredBy: CronTrigger
  errorMessage?: string
}

export interface CronExecutionContext {
  triggeredBy: CronTrigger
  isolateRecordFailure: boolean
}

export interface CronExecutionDependencies {
  dispatch(job: CronExecutionJob): Promise<CronDispatchResult>
  saveHistory(entry: CronHistoryEntry): Promise<void>
  notify(
    job: CronNotificationJob,
    success: boolean,
    stats: ILastRunStats,
    errorMessage?: string
  ): Promise<void>
  now(): number
  reportError(message: string, error: unknown): void
}

const FAILED_STATS: ILastRunStats = {
  total: 0,
  inserted: 0,
  updated: 0,
  errors: 1,
  skipped: 0
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class CronJobExecutor {
  constructor(private readonly dependencies: CronExecutionDependencies) {}

  async execute(
    job: CronExecutionJob,
    context: CronExecutionContext
  ): Promise<CronExecutionResult> {
    const startedAt = this.dependencies.now()

    try {
      const result = await this.dependencies.dispatch(job)
      const duration = this.durationSince(startedAt)

      await this.record(
        job,
        result.stats,
        result.success ? 'success' : 'failed',
        duration,
        context,
        result.errorMessage
      )
      await this.saveHistory(job, result.stats, result.success, duration, context, result.errorMessage)

      if (job.notifications.enabled) {
        await this.dependencies.notify(job, result.success, result.stats, result.errorMessage)
      }

      return {
        success: result.success,
        duration,
        stats: result.stats,
        errorMessage: result.errorMessage
      }
    } catch (error) {
      const duration = this.durationSince(startedAt)
      const errorMessage = messageOf(error)

      await this.record(
        job,
        FAILED_STATS,
        'failed',
        duration,
        context,
        errorMessage
      )
      await this.saveHistory(job, FAILED_STATS, false, duration, context, errorMessage)
      this.dependencies.reportError(`Erro ao executar job: ${job.name}`, error)

      return {
        success: false,
        duration,
        stats: FAILED_STATS,
        errorMessage
      }
    }
  }

  private durationSince(startedAt: number): number {
    return Math.round((this.dependencies.now() - startedAt) / 1000)
  }

  private async record(
    job: CronExecutionJob,
    stats: ILastRunStats,
    status: 'success' | 'failed',
    duration: number,
    context: CronExecutionContext,
    errorMessage?: string
  ): Promise<void> {
    try {
      await job.recordExecution(stats, status, duration, context.triggeredBy, errorMessage)
    } catch (error) {
      if (!context.isolateRecordFailure) throw error
      this.dependencies.reportError(`Erro ao gravar recordExecution para ${job.name}`, error)
    }
  }

  private async saveHistory(
    job: CronExecutionJob,
    stats: ILastRunStats,
    success: boolean,
    duration: number,
    context: CronExecutionContext,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.dependencies.saveHistory({
        jobName: job.name,
        stats,
        status: success ? 'success' : 'error',
        duration,
        triggeredBy: context.triggeredBy,
        errorMessage
      })
    } catch (error) {
      this.dependencies.reportError(`Erro ao salvar histórico para ${job.name}`, error)
    }
  }
}
