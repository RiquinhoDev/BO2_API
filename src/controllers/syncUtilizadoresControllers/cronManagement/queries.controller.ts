import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { SyncType } from '../../../models/SyncModels/CronJobConfig'
import syncSchedulerService from '../../../services/cron/scheduler'
import { type JobIdParams, type LegacyCronConfig, type SystemJob, errorMessage } from './support'

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { syncType, active } = req.query

    let jobs

    if (syncType) {
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
        console.warn('⚠�? Não foi possível ler jobs legacy (cronconfigs):', errorMessage(legacyError))
      }
    }

    res.status(200).json({
      success: true,
      message: 'Jobs recuperados com sucesso',
      data: {
        total: jobs.length,
        jobs,
        systemJobs
      }
    })

  } catch (error: unknown) {
    console.error('�?� Erro ao buscar jobs:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jobs',
      error: errorMessage(error)
    })
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// GET JOB BY ID
// GET /api/cron/jobs/:id
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const getJobById = async (
  req: Request<JobIdParams>,
  res: Response,
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

    res.status(200).json({
      success: true,
      message: 'Job recuperado com sucesso',
      data: {
        job,
        nextExecutions,
        successRate: job.getSuccessRate()
      }
    })

  } catch (error: unknown) {
    console.error('�?� Erro ao buscar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar job',
      error: errorMessage(error)
    })
  }
}
/**
 * Buscar Tag Rules disponíveis por tipo de sincronização
 * GET /api/cron/tag-rules?syncType=hotmart
 */
