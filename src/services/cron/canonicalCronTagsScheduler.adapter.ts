import mongoose from 'mongoose'
import { CronExpressionParser } from 'cron-parser'
import { mapCronJob } from './cronTagsMongoose.mapper'
import type { ICronJobConfig } from '../../models/SyncModels/CronJobConfig'
import type { UpdateCronJobDTO } from '../../types/cron.types'
import type {
  CronJobView,
  CronTagsSchedulerPort,
} from './cronTagsCompatibility.types'

interface CanonicalCronTagsSchedulerOptions {
  scheduler: {
    getJobById(
      id: mongoose.Types.ObjectId,
    ): Promise<ICronJobConfig | null>
    isSchedulerActive(): boolean
    updateJob(
      id: mongoose.Types.ObjectId,
      updates: UpdateCronJobDTO,
    ): Promise<ICronJobConfig>
  }
  now?: () => Date
}

class CanonicalCronTagsScheduler implements CronTagsSchedulerPort {
  private readonly now: () => Date

  constructor(options: CanonicalCronTagsSchedulerOptions) {
    this.scheduler = options.scheduler
    this.now = options.now ?? (() => new Date())
  }

  private readonly scheduler: CanonicalCronTagsSchedulerOptions['scheduler']

  async getJobById(id: string): Promise<CronJobView | null> {
    const job = await this.scheduler.getJobById(
      new mongoose.Types.ObjectId(id),
    )
    return job ? mapCronJob(job) : null
  }

  getNextExecutions(expression: string, count: number): Date[] {
    const interval = CronExpressionParser.parse(expression, {
      currentDate: this.now(),
      tz: 'Europe/Lisbon',
    })
    return interval.take(count).map(date => date.toDate())
  }

  isActive(): boolean {
    return this.scheduler.isSchedulerActive()
  }

  async updateJob(
    id: string,
    updates: {
      cronExpression: string
      enabled: boolean
    },
  ): Promise<CronJobView> {
    const job = await this.scheduler.updateJob(
      new mongoose.Types.ObjectId(id),
      updates,
    )
    return mapCronJob(job)
  }
}

export const createCanonicalCronTagsScheduler = (
  options: CanonicalCronTagsSchedulerOptions,
): CronTagsSchedulerPort => new CanonicalCronTagsScheduler(options)
