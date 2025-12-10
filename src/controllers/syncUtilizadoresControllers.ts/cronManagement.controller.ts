// ════════════════════════════════════════════════════════════
// 📁 src/controllers/cronManagement.controller.ts
// Controller: CRON Job Management
// Endpoints para gestão de jobs agendados
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import mongoose from 'mongoose'
import cronManagementService from '../../services/syncUtilziadoresServices/cronManagement.service'
import { SyncType } from '../../models/SyncModels/CronJobConfig'


// ═══════════════════════════════════════════════════════════
// GET ALL JOBS
// GET /api/cron/jobs
// ═══════════════════════════════════════════════════════════

export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { syncType, active } = req.query

    let jobs

    if (syncType) {
      jobs = await cronManagementService.getJobsByType(syncType as SyncType)
    } else if (active === 'true') {
      jobs = await cronManagementService.getActiveJobs()
    } else {
      jobs = await cronManagementService.getAllJobs()
    }

    res.status(200).json({
      success: true,
      message: 'Jobs recuperados com sucesso',
      data: {
        total: jobs.length,
        jobs
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar jobs:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar jobs',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET JOB BY ID
// GET /api/cron/jobs/:id
// ═══════════════════════════════════════════════════════════

export const getJobById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    const job = await cronManagementService.getJobById(
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
    const nextExecutions = cronManagementService.getNextExecutions(
      job.schedule.cronExpression,
      5,
      job.schedule.timezone
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

  } catch (error: any) {
    console.error('❌ Erro ao buscar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE JOB
// POST /api/cron/jobs
// ═══════════════════════════════════════════════════════════

export const createJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      syncType,
      cronExpression,
      timezone,
      syncConfig,
      notifications,
      retryPolicy
    } = req.body

    // Validações
    if (!name || !syncType || !cronExpression) {
      res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: name, syncType, cronExpression'
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const createdBy = new mongoose.Types.ObjectId('000000000000000000000001')

    const job = await cronManagementService.createJob({
      name,
      description: description || '',
      syncType,
      cronExpression,
      timezone,
      syncConfig,
      notifications,
      retryPolicy,
      createdBy
    })

    // Calcular próximas execuções
    const nextExecutions = cronManagementService.getNextExecutions(
      job.schedule.cronExpression,
      5,
      job.schedule.timezone
    )

    res.status(201).json({
      success: true,
      message: 'Job criado com sucesso',
      data: {
        job,
        nextExecutions
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao criar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao criar job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE JOB
// PUT /api/cron/jobs/:id
// ═══════════════════════════════════════════════════════════

export const updateJob = async (req: Request, res: Response): Promise<void> => {
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

    const job = await cronManagementService.updateJob(
      new mongoose.Types.ObjectId(id),
      updates
    )

    // Calcular próximas execuções
    const nextExecutions = cronManagementService.getNextExecutions(
      job.schedule.cronExpression,
      5,
      job.schedule.timezone
    )

    res.status(200).json({
      success: true,
      message: 'Job atualizado com sucesso',
      data: {
        job,
        nextExecutions
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao atualizar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE JOB
// DELETE /api/cron/jobs/:id
// ═══════════════════════════════════════════════════════════

export const deleteJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    await cronManagementService.deleteJob(
      new mongoose.Types.ObjectId(id)
    )

    res.status(200).json({
      success: true,
      message: 'Job deletado com sucesso'
    })

  } catch (error: any) {
    console.error('❌ Erro ao deletar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// TOGGLE JOB (ENABLE/DISABLE)
// POST /api/cron/jobs/:id/toggle
// ═══════════════════════════════════════════════════════════

export const toggleJob = async (req: Request, res: Response): Promise<void> => {
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

    const job = await cronManagementService.toggleJob(
      new mongoose.Types.ObjectId(id),
      enabled
    )

    res.status(200).json({
      success: true,
      message: `Job ${enabled ? 'ativado' : 'desativado'} com sucesso`,
      data: { job }
    })

  } catch (error: any) {
    console.error('❌ Erro ao toggle job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao toggle job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// TRIGGER JOB MANUALLY
// POST /api/cron/jobs/:id/trigger
// ═══════════════════════════════════════════════════════════

export const triggerJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    // TODO: Pegar user ID do token JWT
    const triggeredBy = new mongoose.Types.ObjectId('000000000000000000000001')

    console.log(`▶️ Executando job manualmente: ${id}`)

    const result = await cronManagementService.executeJobManually(
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

  } catch (error: any) {
    console.error('❌ Erro ao executar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao executar job',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET JOB EXECUTION HISTORY
// GET /api/cron/jobs/:id/history
// ═══════════════════════════════════════════════════════════

export const getJobHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { limit = '10' } = req.query

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'ID inválido'
      })
      return
    }

    const job = await cronManagementService.getJobById(
      new mongoose.Types.ObjectId(id)
    )

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job não encontrado'
      })
      return
    }

    // Por agora, retornamos apenas a última execução
    // TODO: Implementar histórico completo de execuções em collection separada
    const history = job.lastRun ? [job.lastRun] : []

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
        history
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// VALIDATE CRON EXPRESSION
// POST /api/cron/validate
// ═══════════════════════════════════════════════════════════

export const validateCronExpression = async (req: Request, res: Response): Promise<void> => {
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
      const nextExecutions = cronManagementService.getNextExecutions(
        cronExpression,
        5,
        timezone
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

    } catch (validationError: any) {
      res.status(400).json({
        success: false,
        message: 'Cron expression inválida',
        data: {
          cronExpression,
          isValid: false,
          error: validationError.message
        }
      })
    }

  } catch (error: any) {
    console.error('❌ Erro ao validar cron expression:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao validar cron expression',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET SCHEDULER STATUS
// GET /api/cron/status
// ═══════════════════════════════════════════════════════════

export const getSchedulerStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const activeJobs = await cronManagementService.getActiveJobs()
    
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

  } catch (error: any) {
    console.error('❌ Erro ao buscar status:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar status',
      error: error.message
    })
  }
}