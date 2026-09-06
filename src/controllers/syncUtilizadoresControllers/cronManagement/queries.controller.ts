import logger from '../../../utils/logger'
import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../../contracts/responseContract'
import mongoose from 'mongoose'
import type { SyncType } from '../../../models/SyncModels/CronJobConfig'
import syncSchedulerService from '../../../services/cron/scheduler'
import { internalError } from '../../../security/errorHandling'
import { type JobIdParams, type LegacyCronConfig, type SystemJob, errorMessage } from '../../../services/cron/controllerSupport'
import {
  cronManualExecutionView,
  getCronManualCapability,
  type CronManualCapabilityJob,
} from '../../../services/cron/scheduler/manualCapabilities'
import {
  isAchievementEvaluationMutableExecutionEnabled,
  isCronExecutionCleanupMutableExecutionEnabled,
  isSyncMutableExecutionEnabled,
  isWeeklyTagSnapshotMutableExecutionEnabled,
} from '../../../services/requestDrivenRuntimeConfig'
import { isScheduledMessagesEnabled } from '../../../services/renewal/discordScheduledMessages.service'
import { isMessagesEnabled } from '../../../services/renewal/discord/planning'
import { isManualExecutionEnabled } from '../../../services/renewal/renewalAcSync.service'
import WeeklyTagMonitoringConfig from '../../../models/tagMonitoring/WeeklyTagMonitoringConfig'

interface WeeklyManualState {
  enabled: boolean
  blockedReason?: string
}

function manualMutableEnabled(
  job: CronManualCapabilityJob,
  weeklyState?: WeeklyManualState,
): WeeklyManualState {
  const capability = getCronManualCapability(job)
  if (capability.id === 'daily-pipeline') return { enabled: isSyncMutableExecutionEnabled() }
  if (capability.id === 'cron-execution-cleanup') return { enabled: isCronExecutionCleanupMutableExecutionEnabled() }
  if (capability.id === 'achievement-evaluation') return { enabled: isAchievementEvaluationMutableExecutionEnabled() }
  if (capability.id === 'weekly-tag-snapshot') {
    return weeklyState ?? {
      enabled: false,
      blockedReason: 'Configuração de monitorização semanal indisponível',
    }
  }
  if (capability.id === 'discord-scheduled-messages') {
    return { enabled: isScheduledMessagesEnabled() && isMessagesEnabled() }
  }
  if (capability.id === 'renewal-ac-sync') return { enabled: isManualExecutionEnabled() }
  return { enabled: false }
}

async function withManualExecutionView(
  job: CronManualCapabilityJob,
  weeklyState?: WeeklyManualState,
): Promise<Record<string, unknown>> {
  if (typeof job.name !== 'string' || typeof job.syncType !== 'string' || !job._id
    || typeof job._id.toString !== 'function') {
    return job as unknown as Record<string, unknown>
  }
  const jobWithToObject = job as unknown as { toObject?: () => unknown }
  const plain = typeof jobWithToObject.toObject === 'function'
    ? jobWithToObject.toObject()
    : job
  const state = manualMutableEnabled(job, weeklyState)
  return {
    ...(plain as Record<string, unknown>),
    manualExecution: cronManualExecutionView(job, state.enabled, {
      blockedReason: state.blockedReason,
    }),
  }
}

async function weeklyManualStateForJobs(
  jobs: readonly CronManualCapabilityJob[],
): Promise<WeeklyManualState | undefined> {
  if (!jobs.some(job => job.name === 'WeeklyTagSnapshot')) return undefined
  try {
    const config = await WeeklyTagMonitoringConfig.getConfig()
    return {
      enabled: isWeeklyTagSnapshotMutableExecutionEnabled() && config.enabled,
      ...(config.enabled ? {} : { blockedReason: 'Monitorização semanal desativada' }),
    }
  } catch {
    return {
      enabled: false,
      blockedReason: 'Configuração de monitorização semanal indisponível',
    }
  }
}

export const getAllJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { syncType, active } = req.query

    let jobs

    if (syncType) {
      // Legacy raw-query compatibility: invalid/repeated values reached the scheduler unchanged.
      jobs = await syncSchedulerService.getJobsByType(syncType as SyncType)
    } else if (active === 'true') {
      jobs = await syncSchedulerService.getActiveJobs()
    } else {
      jobs = await syncSchedulerService.getAllJobs()
    }

    // Agendamentos que vivem FORA do CronJobConfig (sistemas legacy) — expostos
    // aqui para que TODOS os crons apareçam listados no Backoffice.
    // TAG_RULES_SYNC (TagCronManagement/CronConfig) não é agendado no arranque
    // actual (initializeCronJobs não é invocado no index.ts) — daí scheduledAtRuntime.
    let systemJobs: SystemJob[] = []
    if (!syncType && active !== 'true') {
      try {
        const CronConfig = (await import('../../../models/cron/CronConfig')).default
        const legacyConfigs = await CronConfig.find({}).lean<LegacyCronConfig[]>()
        systemJobs = legacyConfigs.map(cfg => ({
          source: 'legacy-tag-cron',
          name: cfg.name,
          description: 'Sistema legacy de tags AC (colecção cronconfigs) — gerido fora do scheduler principal',
          cronExpression: cfg.cronExpression,
          isActive: cfg.isActive,
          scheduledAtRuntime: false,
          nextRun: cfg.nextRun || null,
          lastRun: cfg.lastRun || null
        }))
      } catch (legacyError: unknown) {
        logger.warn('⚠�? Não foi possível ler jobs legacy (cronconfigs):', errorMessage(legacyError))
      }
    }

    const weeklyState = await weeklyManualStateForJobs(jobs)
    res.status(200).json(successResponse({
        total: jobs.length,
        jobs: await Promise.all(jobs.map(job => withManualExecutionView(job, weeklyState))),
        systemJobs
      }, { message: 'Jobs recuperados com sucesso' }))

  } catch (error: unknown) {
    next(internalError('Erro ao buscar jobs', 'CRON_JOB_LIST_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// GET JOB BY ID
// GET /api/cron/jobs/:id
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const getJobById = async (
  req: Request<JobIdParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    const job = await syncSchedulerService.getJobById(
      new mongoose.Types.ObjectId(id)
    )

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job não encontrado'
      })
      return
    }

    // Calcular próximas execuções
    const nextExecutions = syncSchedulerService.getNextExecutions(
      job.schedule.cronExpression,
      5
    )

    res.status(200).json(successResponse({
      job: await withManualExecutionView(job, await weeklyManualStateForJobs([job])),
      nextExecutions,
      successRate: job.getSuccessRate(),
    }, { message: 'Job recuperado com sucesso' }))

  } catch (error: unknown) {
    next(internalError('Erro ao buscar job', 'CRON_JOB_READ_FAILED', error))
  }
}
/**
 * Buscar Tag Rules disponíveis por tipo de sincronização
 * GET /api/cron/tag-rules?syncType=hotmart
 */
