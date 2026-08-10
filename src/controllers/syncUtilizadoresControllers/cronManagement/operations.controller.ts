import { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { CronExecution } from '../../../models'
import syncSchedulerService from '../../../services/cron/scheduler'
import type { CronEmptyInput } from '../../../security/cronDestructiveInput'
import { internalError } from '../../../security/errorHandling'
import { type JobIdParams, errorMessage } from './support'

export const getJobHistory = async (
  req: Request<JobIdParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params
    const requestedLimit = req.query.limit
    const limit = typeof requestedLimit === 'string'
      ? parseInt(requestedLimit, 10) || 20
      : 20

    console.log(`📊 Buscando histórico do job: ${id} (limit: ${limit})`)

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

    // ✅ NOVO: Buscar histórico completo do CronExecution
    const executions = await CronExecution.find({ cronName: job.name })
      .sort({ startTime: -1 }) // Mais recentes primeiro
      .limit(limit)
      .lean()

    console.log(`✅ ${executions.length} execuções encontradas para ${job.name}`)

    // Transformar para formato esperado pelo frontend
    const history = executions.map(exec => ({
      _id: exec._id,
      jobId: job._id,
      jobName: job.name,
      status: exec.status,
      startedAt: exec.startTime,
      completedAt: exec.endTime,
      duration: exec.duration ? Math.round(exec.duration / 1000) : 0, // Converter ms para segundos
      stats: {
        total: exec.studentsProcessed || 0,
        inserted: 0, // CronExecution não separa inserted/updated
        updated: exec.studentsProcessed || 0,
        errors: exec.status === 'error' ? 1 : 0,
        skipped: 0
      },
      triggeredBy: exec.executionType === 'manual' ? 'MANUAL' : 'CRON',
      errorMessage: exec.errorMessage
    }))

    res.status(200).json({
      success: true,
      message: 'Histórico recuperado com sucesso',
      data: {
        jobId: job._id,
        jobName: job.name,
        totalRuns: job.totalRuns,
        successfulRuns: job.successfulRuns,
        failedRuns: job.failedRuns,
        successRate: job.getSuccessRate(),
        executions: history, // ✅ MUDOU: campo "executions" em vez de "history"
        count: history.length,
        limit
      }
    })

  } catch (error: unknown) {
    console.error('�?� Erro ao buscar histórico:', error)
    next(internalError('Erro ao buscar histórico', 'CRON_JOB_HISTORY_FAILED', error))
  }
}



// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// VALIDATE CRON EXPRESSION
// POST /api/cron/validate
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const validateCronExpression = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cronExpression, timezone = 'Europe/Lisbon' } = req.body

    if (!cronExpression) {
      res.status(400).json({
        success: false,
        message: 'Campo "cronExpression" é obrigatório'
      })
      return
    }

    try {
      const nextExecutions = syncSchedulerService.getNextExecutions(
        cronExpression,
        5
      )

      res.status(200).json({
        success: true,
        message: 'Cron expression válida',
        data: {
          cronExpression,
          timezone,
          isValid: true,
          nextExecutions
        }
      })

    } catch (validationError: unknown) {
      res.status(400).json({
        success: false,
        message: 'Cron expression inválida',
        data: {
          cronExpression,
          isValid: false,
          error: errorMessage(validationError)
        }
      })
    }

  } catch (error: unknown) {
    console.error('�?� Erro ao validar cron expression:', error)
    next(internalError('Erro ao validar cron expression', 'CRON_EXPRESSION_VALIDATION_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// GET SCHEDULER STATUS
// GET /api/cron/status
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const getSchedulerStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const activeJobs = await syncSchedulerService.getActiveJobs()

    const stats = {
      totalActiveJobs: activeJobs.length,
      enabledJobs: activeJobs.filter(j => j.schedule.enabled).length,
      disabledJobs: activeJobs.filter(j => !j.schedule.enabled).length,
      byType: {
        hotmart: activeJobs.filter(j => j.syncType === 'hotmart').length,
        curseduca: activeJobs.filter(j => j.syncType === 'curseduca').length,
        discord: activeJobs.filter(j => j.syncType === 'discord').length,
        all: activeJobs.filter(j => j.syncType === 'all').length
      }
    }

    res.status(200).json({
      success: true,
      message: 'Status do scheduler recuperado',
      data: {
        schedulerRunning: true,
        stats,
        activeJobs: activeJobs.map(j => ({
          id: j._id,
          name: j.name,
          syncType: j.syncType,
          enabled: j.schedule.enabled,
          nextRun: j.nextRun,
          lastRun: j.lastRun
        }))
      }
    })

  } catch (error: unknown) {
    console.error('�?� Erro ao buscar status:', error)
    next(internalError('Erro ao buscar status', 'CRON_SCHEDULER_STATUS_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// TRIGGER TAG RULES ONLY (sem sync)
// POST /api/cron/tag-rules-only
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const triggerTagRulesOnly = async (
  _input: CronEmptyInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  console.log('�?'.repeat(60))
  console.log('�?��?  [TAG-RULES-ONLY] Endpoint chamado!')
  console.log('�?��?  [TAG-RULES-ONLY] Timestamp:', new Date().toISOString())
  console.log('�?'.repeat(60))

  try {
    console.log('�?��?  [TAG-RULES-ONLY] A importar dailyPipeline.service...')

    // Import dinâmico para evitar circular dependencies
    const { executeTagRulesOnly } = await import('../../../services/cron/dailyPipeline.service')
    console.log('�?��?  [TAG-RULES-ONLY] Import OK, a chamar executeTagRulesOnly()...')

    const result = await executeTagRulesOnly()
    console.log('�?��?  [TAG-RULES-ONLY] executeTagRulesOnly() retornou!')

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Tag Rules Only executado com sucesso'
        : 'Tag Rules Only executado com erros',
      data: {
        duration: result.duration,
        completedAt: result.completedAt,
        steps: {
          preCreateTags: {
            success: result.steps.preCreateTags.success,
            duration: result.steps.preCreateTags.duration,
            totalTags: result.steps.preCreateTags.stats?.totalTags || 0
          },
          recalcEngagement: {
            success: result.steps.recalcEngagement.success,
            duration: result.steps.recalcEngagement.duration,
            updated: result.steps.recalcEngagement.stats?.updated || 0
          },
          evaluateTagRules: {
            success: result.steps.evaluateTagRules.success,
            duration: result.steps.evaluateTagRules.duration,
            total: result.steps.evaluateTagRules.stats?.total || 0,
            tagsApplied: result.steps.evaluateTagRules.stats?.tagsApplied || 0,
            tagsRemoved: result.steps.evaluateTagRules.stats?.tagsRemoved || 0
          }
        },
        summary: result.summary,
        errors: result.errors
      }
    })

  } catch (error: unknown) {
    console.error('�?� Erro ao executar Tag Rules Only:', error)
    next(internalError('Erro ao executar Tag Rules Only', 'CRON_TAG_RULES_TRIGGER_FAILED', error))
  }
}
