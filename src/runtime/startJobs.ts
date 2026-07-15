import type { JobStarter } from '../bootstrap'
import mongoose from 'mongoose'
import jobScheduler from '../jobs'
import systemMonitor from '../services/systemMonitor.service'
import syncSchedulerService from '../services/cron/scheduler'
import { warmUpCache } from '../services/syncUtilizadoresServices/dualReadService'
import { buildDashboardStats } from '../services/dashboardStatsBuilder.service'
import analyticsCacheService from '../services/analytics/analyticsCache.service'

let shutdownHandlersRegistered = false

async function ensureCronSeeds(): Promise<void> {
  const CronJobConfig = (await import('../models/SyncModels/CronJobConfig')).default
  const systemCronAdminId = new mongoose.Types.ObjectId('000000000000000000000001')

  try {
    const existingClarezaJob = await CronJobConfig.findOne({ name: 'ClarezaRefresh' })
    if (!existingClarezaJob) {
      await CronJobConfig.create({
        name: 'ClarezaRefresh',
        description: 'Atualiza dados do Termómetro Clareza 3×/dia via Financial Modeling Prep API',
        syncType: 'clareza',
        schedule: {
          cronExpression: '0 6,12,18 * * *',
          timezone: 'Europe/Lisbon',
          enabled: true,
        },
        syncConfig: { fullSync: true, includeProgress: false, includeTags: false, batchSize: 200 },
        tagRules: [],
        tagRuleOptions: {
          enabled: false,
          executeAllRules: false,
          runInParallel: false,
          stopOnError: false,
        },
        notifications: {
          enabled: false,
          emailOnSuccess: false,
          emailOnFailure: false,
          recipients: [],
        },
        retryPolicy: { maxRetries: 2, retryDelayMinutes: 30, exponentialBackoff: false },
        nextRun: new Date(),
        createdBy: systemCronAdminId,
        isActive: true,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
      })
      await syncSchedulerService.initializeScheduler()
    } else {
      const needsScheduleRepair =
        existingClarezaJob.schedule.cronExpression !== '0 6,12,18 * * *' ||
        existingClarezaJob.schedule.timezone !== 'Europe/Lisbon'
      const missingCreatedBy = !(existingClarezaJob as any).createdBy

      if (needsScheduleRepair) {
        existingClarezaJob.set('schedule.cronExpression', '0 6,12,18 * * *')
        existingClarezaJob.set('schedule.timezone', 'Europe/Lisbon')
      }
      if (missingCreatedBy) existingClarezaJob.set('createdBy', systemCronAdminId)
      if (needsScheduleRepair || missingCreatedBy) {
        await existingClarezaJob.save()
        await syncSchedulerService.initializeScheduler()
      }
    }
  } catch (error) {
    console.error('⚠️ [Clareza] Erro ao criar cron job seed:', error)
  }

  try {
    const existingTrialJob = await CronJobConfig.findOne({ name: 'GuruTrialCheck' })
    if (!existingTrialJob) {
      await CronJobConfig.create({
        name: 'GuruTrialCheck',
        description:
          'Sincroniza trials Guru e marca expirados (>7d sem conversão) PARA_INATIVAR; não inativa.',
        syncType: 'guru',
        schedule: { cronExpression: '0 7 * * *', timezone: 'Europe/Lisbon', enabled: true },
        syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 200 },
        tagRules: [],
        tagRuleOptions: {
          enabled: false,
          executeAllRules: false,
          runInParallel: false,
          stopOnError: false,
        },
        notifications: {
          enabled: false,
          emailOnSuccess: false,
          emailOnFailure: false,
          recipients: [],
        },
        retryPolicy: { maxRetries: 2, retryDelayMinutes: 30, exponentialBackoff: false },
        nextRun: new Date(),
        createdBy: systemCronAdminId,
        isActive: true,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
      })
      await syncSchedulerService.initializeScheduler()
    }
  } catch (error) {
    console.error('⚠️ [GuruTrials] Erro ao criar cron job seed:', error)
  }
}

function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return
  shutdownHandlersRegistered = true

  const shutdown = () => {
    systemMonitor.stop()
    try {
      syncSchedulerService.stopScheduler()
    } catch (error) {
      console.error('⚠️ Erro ao parar scheduler:', error)
    }
    process.exit(0)
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

export const startJobs: JobStarter = async (config) => {
  try {
    jobScheduler.startAll()
  } catch (error) {
    console.error('⚠️ Erro ao inicializar jobs; servidor continua sem jobs:', error)
  }

  try {
    await syncSchedulerService.initializeScheduler()
  } catch (error) {
    console.error('⚠️ Erro ao inicializar Sync Utilizadores:', error)
  }

  await ensureCronSeeds()

  if (config.nodeEnv === 'production') systemMonitor.start()

  void import('../services/clareza/clarezaTop10Service')
    .then(({ getClarezaTop10Json }) => getClarezaTop10Json())
    .catch((error) => console.error('⚠️ Falha a aquecer cache Clareza Top10:', error))

  void warmUpCache()
    .then(() => buildDashboardStats())
    .catch((error) => console.error('⚠️ Erro no warm-up:', error))

  void analyticsCacheService
    .warmUpCache()
    .catch((error) => console.error('⚠️ Erro ao aquecer cache de analytics:', error))

  registerShutdownHandlers()
}
