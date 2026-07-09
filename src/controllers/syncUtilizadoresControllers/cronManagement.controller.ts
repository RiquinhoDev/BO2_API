// ════════════════════════════════════════════════════════════
// 📁 src/controllers/cronManagement.controller.ts
// Controller: CRON Job Management
// Endpoints para gestão de jobs agendados
// ════════════════════════════════════════════════════════════

import { Request, RequestHandler, Response } from 'express'
import mongoose from 'mongoose'

import { SyncType } from '../../models/SyncModels/CronJobConfig'
import { CronExecution, Product, TagRule } from '../../models'
import syncSchedulerService from '../../services/cron/scheduler'


// ═══════════════════════════════════════════════════════════
// GET ALL JOBS
// GET /api/cron/jobs
// ═══════════════════════════════════════════════════════════

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
    let systemJobs: any[] = []
    if (!syncType && active !== 'true') {
      try {
        const CronConfig = (await import('../../models/cron/CronConfig')).default
        const legacyConfigs = await CronConfig.find({}).lean()
        systemJobs = legacyConfigs.map((cfg: any) => ({
          source: 'legacy-tag-cron',
          name: cfg.name,
          description: 'Sistema legacy de tags AC (colecção cronconfigs) — gerido fora do scheduler principal',
          cronExpression: cfg.cronExpression,
          isActive: cfg.isActive,
          scheduledAtRuntime: false,
          nextRun: cfg.nextRun || null,
          lastRun: cfg.lastRun || null
        }))
      } catch (legacyError: any) {
        console.warn('⚠️ Não foi possível ler jobs legacy (cronconfigs):', legacyError.message)
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

  } catch (error: any) {
    console.error('❌ Erro ao buscar job:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar job',
      error: error.message
    })
  }
}
/**
 * Buscar Tag Rules disponíveis por tipo de sincronização
 * GET /api/cron/tag-rules?syncType=hotmart
 */
export const getAvailableTagRules: RequestHandler = async (req, res, next) => {
  try {
    const syncType = req.query.syncType as SyncType | undefined

    if (!syncType || !['hotmart', 'curseduca', 'discord', 'all'].includes(syncType)) {
      res.status(400).json({
        success: false,
        message: 'syncType inválido. Use: hotmart, curseduca, discord ou all'
      })
      return
    }

    console.log(`[CRON] 🔍 Buscando Tag Rules para syncType: ${syncType}`)

    const TagRule = (await import('../../models/acTags/TagRule')).default
    const Course = (await import('../../models/Course')).default
    const Product = (await import('../../models/product/Product')).default

    let courseIds: mongoose.Types.ObjectId[] = []

    if (syncType === 'all') {
      const courses = await Course.find({ isActive: true }).select('_id').lean()
      courseIds = courses.map(c => new mongoose.Types.ObjectId(String(c._id)))
    } else {
      const products = await Product.find({
        platform: syncType,
        isActive: true
      }).select('courseId').lean()

      const uniqueIds = [...new Set(products.map(p => p.courseId?.toString()).filter(Boolean) as string[])]
      courseIds = uniqueIds.map(id => new mongoose.Types.ObjectId(id))
    }

    console.log(`[CRON] 📚 Encontrados ${courseIds.length} courses para plataforma ${syncType}`)

    if (courseIds.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Nenhum course encontrado para esta plataforma',
        data: { rules: [], groupedByCourse: [], totalRules: 0, totalCourses: 0 }
      })
      return
    }

    const rules = await TagRule.find({
      courseId: { $in: courseIds },
      isActive: true
    })
      .populate('courseId', 'name code trackingType')
      .sort({ priority: -1, createdAt: -1 })
      .lean()

    const groupedByCourse = rules.reduce((acc: any[], rule: any) => {
      if (!rule.courseId) return acc

      const course = rule.courseId
      const courseId = course._id.toString()

      let group = acc.find(g => g.courseId === courseId)
      if (!group) {
        group = {
          courseName: course.name || 'Sem Nome',
          courseId,
          courseCode: course.code || 'UNKNOWN',
          platform: syncType === 'all' ? 'all' : syncType,
          rules: [],
          totalRules: 0
        }
        acc.push(group)
      }

      group.rules.push({
        _id: rule._id,
        name: rule.name,
        tagName: rule.actions?.addTag || 'N/A',
        description: rule.description || '',
        category: rule.category,
        priority: rule.priority,
        course: { _id: course._id, name: course.name, code: course.code },
        conditions: rule.conditions || [],
        estimatedStudents: 0,
        isActive: rule.isActive
      })

      group.totalRules++
      return acc
    }, [])

    groupedByCourse.sort((a, b) => a.courseName.localeCompare(b.courseName))

    res.status(200).json({
      success: true,
      message: `${rules.length} Tag Rules encontradas`,
      data: {
        rules: rules.map((rule: any) => ({
          _id: rule._id,
          name: rule.name,
          tagName: rule.actions?.addTag || 'N/A',
          description: rule.description || '',
          category: rule.category,
          priority: rule.priority,
          course: rule.courseId
            ? { _id: rule.courseId._id, name: rule.courseId.name, code: rule.courseId.code }
            : null,
          conditions: rule.conditions || [],
          isActive: rule.isActive
        })),
        groupedByCourse,
        totalRules: rules.length,
        totalCourses: groupedByCourse.length
      }
    })
  } catch (err) {
    next(err) // 🔥 importante para Express lidar com o erro corretamente
  }
}



/**
 * Helper: Agrupar regras por curso
 */
function groupRulesByCourse(rules: any[]) {
  const grouped: Record<string, any[]> = {}

  rules.forEach(rule => {
    const courseName = rule.product?.name || 'Sem Curso'
    if (!grouped[courseName]) {
      grouped[courseName] = []
    }
    grouped[courseName].push(rule)
  })

  return Object.entries(grouped).map(([courseName, rules]) => ({
    courseName,
    courseId: rules[0]?.product?._id,
    platform: rules[0]?.product?.platform,
    rules: rules,
    totalRules: rules.length
  }))
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

    await syncSchedulerService.deleteJob(
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

    const job = await syncSchedulerService.toggleJob(
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
    const limit = parseInt(req.query.limit as string) || 20

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

  } catch (error: any) {
    console.error('❌ Erro ao buscar status:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar status',
      error: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// TRIGGER TAG RULES ONLY (sem sync)
// POST /api/cron/tag-rules-only
// ═══════════════════════════════════════════════════════════

export const triggerTagRulesOnly = async (req: Request, res: Response): Promise<void> => {
  console.log('━'.repeat(60))
  console.log('🏷️  [TAG-RULES-ONLY] Endpoint chamado!')
  console.log('🏷️  [TAG-RULES-ONLY] Timestamp:', new Date().toISOString())
  console.log('━'.repeat(60))

  try {
    console.log('🏷️  [TAG-RULES-ONLY] A importar dailyPipeline.service...')

    // Import dinâmico para evitar circular dependencies
    const { executeTagRulesOnly } = await import('../../services/cron/dailyPipeline.service')
    console.log('🏷️  [TAG-RULES-ONLY] Import OK, a chamar executeTagRulesOnly()...')

    const result = await executeTagRulesOnly()
    console.log('🏷️  [TAG-RULES-ONLY] executeTagRulesOnly() retornou!')

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

  } catch (error: any) {
    console.error('❌ Erro ao executar Tag Rules Only:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao executar Tag Rules Only',
      error: error.message
    })
  }
}