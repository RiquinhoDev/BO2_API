import type {
  CronExecutionView,
  CronJobView,
  CronStatistics,
  CronTagsCompatibilityDependencies,
} from './cronTagsCompatibility.types'
import { cronToHumanReadable } from '../../utils/cronDescription'

const TAG_RULES_JOB = 'TAG_RULES_SYNC'
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

type ScheduledCronJob = CronJobView & { nextRun: Date }

function hasFutureRun(
  job: CronJobView,
  now: Date,
): job is ScheduledCronJob {
  return (
    job.schedule.enabled
    && job.nextRun !== undefined
    && job.nextRun > now
  )
}

export class CronTagsJobNotFoundError extends Error {
  constructor() {
    super('Configuração de TAG_RULES_SYNC não encontrada')
    this.name = 'CronTagsJobNotFoundError'
  }
}

export class CronTagsCompatibilityService {
  private readonly now: () => Date

  constructor(
    private readonly dependencies: CronTagsCompatibilityDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date())
  }

  async getConfig(): Promise<CronJobView | null> {
    return this.dependencies.repository.findJobByName(TAG_RULES_JOB)
  }

  async updateConfig(input: {
    cronExpression: string
    isActive: boolean
  }): Promise<CronJobView> {
    const job = await this.getConfig()
    if (!job) throw new CronTagsJobNotFoundError()

    return this.dependencies.scheduler.updateJob(job._id, {
      cronExpression: input.cronExpression,
      enabled: input.isActive,
    })
  }

  async getHistory(limit: number): Promise<CronExecutionView[]> {
    return this.dependencies.repository.listExecutions({
      cronName: TAG_RULES_JOB,
      limit,
    })
  }

  async getStatistics(days: number): Promise<CronStatistics> {
    return this.dependencies.repository.getStatistics({
      cronName: TAG_RULES_JOB,
      since: new Date(this.now().getTime() - days * MILLISECONDS_PER_DAY),
    })
  }

  async getJobHistory(id: string, limit: number) {
    const job = await this.dependencies.scheduler.getJobById(id)
    if (!job) throw new CronTagsJobNotFoundError()

    const executions = await this.dependencies.repository.listExecutions({
      cronName: job.name,
      limit,
    })
    const totalRuns = job.totalRuns

    return {
      jobId: job._id,
      jobName: job.name,
      totalRuns,
      successfulRuns: job.successfulRuns,
      failedRuns: job.failedRuns,
      successRate:
        totalRuns > 0
          ? Math.round((job.successfulRuns / totalRuns) * 100)
          : 0,
      executions: executions.map(execution => ({
        _id: execution._id,
        jobId: job._id,
        jobName: job.name,
        status: execution.status,
        startedAt: execution.startTime,
        completedAt: execution.endTime,
        duration: Math.round((execution.duration ?? 0) / 1000),
        stats: {
          total: execution.studentsProcessed,
          inserted: 0,
          updated: execution.studentsProcessed,
          errors: execution.status === 'error' ? 1 : 0,
          skipped: 0,
        },
        triggeredBy:
          execution.executionType === 'manual' ? 'MANUAL' : 'CRON',
        errorMessage: execution.errorMessage,
      })),
      count: executions.length,
      limit,
    }
  }

  validateCronExpression(expression: string) {
    return {
      nextExecutions:
        this.dependencies.scheduler.getNextExecutions(expression, 5),
      humanReadable: cronToHumanReadable(expression),
    }
  }

  async getStatus() {
    const [jobs, recentExecutions] = await Promise.all([
      this.dependencies.repository.listActiveJobs(),
      this.dependencies.repository.listExecutions({ limit: 10 }),
    ])
    const now = this.now()
    const successfulRuns = jobs.reduce(
      (total, job) => total + job.successfulRuns,
      0,
    )
    const totalRuns = jobs.reduce((total, job) => total + job.totalRuns, 0)

    const upcomingJobs = jobs
      .filter(job => hasFutureRun(job, now))
      .sort((left, right) => {
        const nextRunDifference =
          left.nextRun.getTime() - right.nextRun.getTime()
        return nextRunDifference || left._id.localeCompare(right._id)
      })
      .slice(0, 5)
      .map(job => ({
        id: job._id,
        name: job.name,
        syncType: job.syncType,
        nextRun: job.nextRun,
        minutesUntil: Math.round(
          (job.nextRun.getTime() - now.getTime()) / 60000,
        ),
      }))

    return {
      stats: {
        totalJobs: jobs.length,
        enabledJobs: jobs.filter(job => job.schedule.enabled).length,
        disabledJobs: jobs.filter(job => !job.schedule.enabled).length,
        totalExecutions: recentExecutions.length,
        successRate:
          totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
        schedulerActive: this.dependencies.scheduler.isActive(),
      },
      upcomingJobs,
      recentExecutions,
    }
  }
}

export const createCronTagsCompatibilityService = (
  dependencies: CronTagsCompatibilityDependencies,
): CronTagsCompatibilityService =>
  new CronTagsCompatibilityService(dependencies)
