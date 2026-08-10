import { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'

export interface CronNotificationJob {
  name: string
  notifications: {
    enabled: boolean
    emailOnSuccess: boolean
    emailOnFailure: boolean
    recipients: string[]
    webhookUrl?: string
  }
}

export interface CronNotificationPort {
  notify(
    job: CronNotificationJob,
    success: boolean,
    stats: ILastRunStats,
    errorMessage?: string
  ): Promise<void>
}

interface NotificationLogger {
  info(message: string, metadata: Record<string, unknown>): void
}

export const createLoggingCronNotification = (
  logger: NotificationLogger
): CronNotificationPort => ({
  async notify(job, success, stats, errorMessage): Promise<void> {
    const shouldNotify = success
      ? job.notifications.emailOnSuccess
      : job.notifications.emailOnFailure
    if (!job.notifications.enabled || !shouldNotify) return

    logger.info('Cron notification (delivery disabled)', {
      job: job.name,
      success,
      stats,
      errorMessage,
      recipients: job.notifications.recipients,
      webhookUrl: job.notifications.webhookUrl
    })
  }
})
