import { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { TagRule } from '../../../models'
import syncSchedulerService from '../../../services/cron/scheduler'
import type { CronJobIdInput } from '../../../security/cronDestructiveInput'
import { internalError } from '../../../security/errorHandling'
import { type JobIdParams } from '../../../services/cron/controllerSupport'

export const createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name,
      description,
      syncType,
      cronExpression,
      timezone,
      syncConfig,
      notifications,
      retryPolicy,
      tagRules,              // ✨ NOVO
      tagRuleOptions         // ✨ NOVO
    } = req.body

    // Validações
    if (!name || !syncType || !cronExpression) {
      res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: name, syncType, cronExpression'
      })
      return
    }

    // ✨ NOVO: Validar Tag Rules se fornecidas
    if (tagRules && tagRules.length > 0) {
      const validRules = await TagRule.find({
        _id: { $in: tagRules },
        isActive: true
      })

      if (validRules.length !== tagRules.length) {
        res.status(400).json({
          success: false,
          message: 'Algumas Tag Rules selecionadas não são válidas ou estão inativas'
        })
        return
      }

      console.log(`✅ ${validRules.length} Tag Rules validadas`)
    }

    // TODO: Pegar user ID do token JWT
    const createdBy = new mongoose.Types.ObjectId('000000000000000000000001')

    const job = await syncSchedulerService.createJob({
      name,
      description: description || '',
      syncType,
      cronExpression,
      timezone,
      syncConfig,
      notifications,
      retryPolicy,
      tagRules,              // ✨ NOVO
      tagRuleOptions,        // ✨ NOVO
      createdBy
    })

    // Calcular próximas execuções
    const nextExecutions = syncSchedulerService.getNextExecutions(
      job.schedule.cronExpression,
      5
    )

    res.status(201).json({
      success: true,
      message: 'Job criado com sucesso',
      data: {
        job,
        nextExecutions,
        tagRulesCount: job.tagRules?.length || 0  // ✨ NOVO
      }
    })

  } catch (error: unknown) {
    next(internalError('Erro ao criar job', 'CRON_JOB_CREATE_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// UPDATE JOB
// PUT /api/cron/jobs/:id
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const updateJob = async (
  req: Request<JobIdParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params
    const updates = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    // ✨ NOVO: Validar Tag Rules se fornecidas
    if (updates.tagRules && updates.tagRules.length > 0) {
      const validRules = await TagRule.find({
        _id: { $in: updates.tagRules },
        isActive: true
      })

      if (validRules.length !== updates.tagRules.length) {
        res.status(400).json({
          success: false,
          message: 'Algumas Tag Rules selecionadas não são válidas ou estão inativas'
        })
        return
      }

      console.log(`✅ ${validRules.length} Tag Rules validadas`)
    }

    const job = await syncSchedulerService.updateJob(
      new mongoose.Types.ObjectId(id),
      updates
    )

    // Calcular próximas execuções
    const nextExecutions = syncSchedulerService.getNextExecutions(
      job.schedule.cronExpression,
      5
    )

    res.status(200).json({
      success: true,
      message: 'Job atualizado com sucesso',
      data: {
        job,
        nextExecutions,
        tagRulesCount: job.tagRules?.length || 0  // ✨ NOVO
      }
    })

  } catch (error: unknown) {
    next(internalError('Erro ao atualizar job', 'CRON_JOB_UPDATE_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// DELETE JOB
// DELETE /api/cron/jobs/:id
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const deleteJob = async (
  input: CronJobIdInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = input.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    await syncSchedulerService.deleteJob(
      new mongoose.Types.ObjectId(id)
    )

    res.status(200).json({
      success: true,
      message: 'Job deletado com sucesso'
    })

  } catch (error: unknown) {
    next(internalError('Erro ao deletar job', 'CRON_JOB_DELETE_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// TOGGLE JOB (ENABLE/DISABLE)
// POST /api/cron/jobs/:id/toggle
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const toggleJob = async (
  req: Request<JobIdParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params
    const { enabled } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'Campo "enabled" deve ser boolean'
      })
      return
    }

    const job = await syncSchedulerService.toggleJob(
      new mongoose.Types.ObjectId(id),
      enabled
    )

    res.status(200).json({
      success: true,
      message: `Job ${enabled ? 'ativado' : 'desativado'} com sucesso`,
      data: { job }
    })

  } catch (error: unknown) {
    next(internalError('Erro ao toggle job', 'CRON_JOB_TOGGLE_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// TRIGGER JOB MANUALLY
// POST /api/cron/jobs/:id/trigger
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

export const triggerJob = async (
  input: CronJobIdInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = input.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const triggeredBy = new mongoose.Types.ObjectId('000000000000000000000001')

    console.log(`▶�? Executando job manualmente: ${id}`)

    const result = await syncSchedulerService.executeJobManually(
      new mongoose.Types.ObjectId(id),
      triggeredBy
    )

    res.status(200).json({
      success: result.success,
      message: result.success 
        ? 'Job executado com sucesso' 
        : 'Job executado com erros',
      data: {
        duration: result.duration,
        stats: result.stats,
        errorMessage: result.errorMessage
      }
    })

  } catch (error: unknown) {
    next(internalError('Erro ao executar job', 'CRON_JOB_TRIGGER_FAILED', error))
  }
}

// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?
// GET JOB EXECUTION HISTORY
// GET /api/cron/jobs/:id/history
// �?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?

