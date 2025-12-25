// ════════════════════════════════════════════════════════════════════════════
// 📁 src/controllers/acTags/cronManagement.controller.ts
// Controller: CRON Management System (VERSÃO COMPLETA HÍBRIDA)
// Combina: Tag Rules Sync (antigo) + CRON Jobs Management (novo)
// ════════════════════════════════════════════════════════════════════════════

import { Request, Response, RequestHandler } from 'express'
import mongoose from 'mongoose'
import cronManagementService from '../../services/syncUtilziadoresServices/cronManagement.service'
import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import { CronExecution } from '../../models'


// ════════════════════════════════════════════════════════════════════════════
// 🔷 PARTE 1: TAG RULES SYNC (SISTEMA ANTIGO/ESPECÍFICO)
// Endpoints para sincronização de tags (sistema existente)
// ════════════════════════════════════════════════════════════════════════════

class CronManagementController {
  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - GET CONFIG
  // ═══════════════════════════════════════════════════════════
  
  /**
   * GET /api/cron/config
   * Obtém configuração atual do cron de Tag Rules
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      console.log('📋 [API] GET /api/cron/config')
      
      const config = await cronManagementService.getCronConfig('TAG_RULES_SYNC')
      
      if (!config) {
        res.status(404).json({ 
          success: false,
          error: 'Configuração não encontrada' 
        })
        return
      }

      res.json({
        success: true,
        config
      })
    } catch (error: any) {
      console.error('❌ Erro ao obter config:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - UPDATE CONFIG
  // ═══════════════════════════════════════════════════════════

  /**
   * PUT /api/cron/config
   * Atualiza configuração do cron de Tag Rules
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      console.log('⚙️ [API] PUT /api/cron/config', req.body)
      
      const { cronExpression, isActive } = req.body

      const config = await cronManagementService.updateCronConfig('TAG_RULES_SYNC', {
        cronExpression,
        isActive,
      })

      res.json({
        success: true,
        message: 'Configuração atualizada com sucesso',
        config,
      })
    } catch (error: any) {
      console.error('❌ Erro ao atualizar config:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - EXECUTE NOW (INTELIGENTE)
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/execute
   * 🆕 Executa sincronização INTELIGENTE manualmente (novo sistema)
   */
  async executeNow(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔥 [API] POST /api/cron/execute (MANUAL - INTELIGENTE)')
      
      const userId = req.body.userId // Assumindo que vem do auth middleware

      // Usar novo sistema inteligente
      const result = await cronManagementService.executeIntelligentTagSync('manual', userId)

      if (result.success) {
        res.json({
          success: true,
          message: 'Sincronização inteligente executada com sucesso',
          executionId: result.executionId,
          summary: result.summary,
          detailsByProduct: result.detailsByProduct
        })
      } else {
        res.status(500).json({
          success: false,
          message: 'Erro na sincronização inteligente',
          error: result.error,
          executionId: result.executionId
        })
      }
    } catch (error: any) {
      console.error('❌ Erro ao executar sync inteligente:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - EXECUTE LEGACY
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/execute-legacy
   * ⚠️ Executa sincronização LEGADA manualmente (sistema antigo)
   * @deprecated Use /api/cron/execute para o novo sistema inteligente
   */
  async executeLegacy(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔥 [API] POST /api/cron/execute-legacy (MANUAL - LEGADO)')
      
      const userId = req.body.userId

      const result = await cronManagementService.executeTagRulesSync('manual', userId)

      if (result.success) {
        res.json({
          success: true,
          message: 'Sincronização legada executada com sucesso',
          execution: result.execution,
          result: result.result,
        })
      } else {
        res.status(500).json({
          success: false,
          message: 'Erro na sincronização legada',
          error: result.error,
          execution: result.execution,
        })
      }
    } catch (error: any) {
      console.error('❌ Erro ao executar sync legado:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - HISTORY
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/history
   * Obtém histórico de execuções (Tag Rules)
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      console.log('📋 [API] GET /api/cron/history')
      
      const limit = parseInt(req.query.limit as string) || 10
      const history = await cronManagementService.getExecutionHistory(limit)
      
      res.json({
        success: true,
        history
      })
    } catch (error: any) {
      console.error('❌ Erro ao obter histórico:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAG RULES SYNC - STATISTICS
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/statistics
   * Obtém estatísticas (Tag Rules)
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      console.log('📊 [API] GET /api/cron/statistics')
      
      const days = parseInt(req.query.days as string) || 30
      const stats = await cronManagementService.getStatistics(days)
      
      res.json({
        success: true,
        statistics: stats
      })
    } catch (error: any) {
      console.error('❌ Erro ao obter estatísticas:', error)
      res.status(500).json({ 
        success: false,
        error: error.message 
      })
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 🔷 PARTE 2: CRON JOBS MANAGEMENT (SISTEMA NOVO/GENÉRICO)
  // Endpoints para gestão completa de CRON jobs (qualquer tipo)
  // ════════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // JOBS - GET ALL
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/jobs
   * Listar todos os jobs CRON
   */
  async getAllJobs(req: Request, res: Response): Promise<void> {
    try {
      const { syncType, enabled, isActive } = req.query

      console.log('📋 Buscando jobs CRON...', { syncType, enabled, isActive })

      const filter: any = {}
      
      if (syncType) filter.syncType = syncType
      if (enabled !== undefined) filter['schedule.enabled'] = enabled === 'true'
      if (isActive !== undefined) filter.isActive = isActive === 'true'

      const jobs = await CronJobConfig.find(filter)
        .sort({ createdAt: -1 })
        .lean()

      const stats = {
        total: jobs.length,
        enabled: jobs.filter(j => j.schedule.enabled).length,
        active: jobs.filter(j => j.isActive).length,
        byType: {
          hotmart: jobs.filter(j => j.syncType === 'hotmart').length,
          curseduca: jobs.filter(j => j.syncType === 'curseduca').length,
          discord: jobs.filter(j => j.syncType === 'discord').length,
          all: jobs.filter(j => j.syncType === 'all').length,
        }
      }

      console.log(`✅ ${jobs.length} jobs encontrados`)

      res.json({
        success: true,
        jobs,
        stats
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao buscar jobs:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar jobs'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - GET BY ID
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/jobs/:id
   * Obter job específico
   */
  async getJobById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params

      console.log(`🔍 Buscando job: ${id}`)

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          error: 'ID inválido'
        })
        return
      }

      const job = await CronJobConfig.findById(id).lean()

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job não encontrado'
        })
        return
      }

      // Buscar últimas 5 execuções
      const recentExecutions = await CronExecution.find({
        jobId: id
      })
        .sort({ startedAt: -1 })
        .limit(5)
        .lean()

      console.log(`✅ Job encontrado: ${job.name}`)

      res.json({
        success: true,
        job,
        recentExecutions
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao buscar job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - CREATE
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/jobs
   * Criar novo job
   */
  async createJob(req: Request, res: Response): Promise<void> {
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

      console.log(`📝 Criando job: ${name}`)

      // Validações básicas
      if (!name || !syncType || !cronExpression) {
        res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: name, syncType, cronExpression'
        })
        return
      }

      // TODO: Pegar do user autenticado
      const createdBy = new mongoose.Types.ObjectId()

      const job = await cronManagementService.createJob({
        name,
        description,
        syncType,
        cronExpression,
        timezone,
        syncConfig,
        notifications,
        retryPolicy,
        createdBy
      })

      console.log(`✅ Job criado: ${job._id}`)

      res.status(201).json({
        success: true,
        job,
        message: 'Job criado e agendado com sucesso'
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao criar job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao criar job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - UPDATE
  // ═══════════════════════════════════════════════════════════

  /**
   * PUT /api/cron/jobs/:id
   * Atualizar job
   */
  async updateJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params
      const updateData = req.body

      console.log(`📝 Atualizando job: ${id}`)

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          error: 'ID inválido'
        })
        return
      }

      const job = await cronManagementService.updateJob(
        new mongoose.Types.ObjectId(id),
        updateData
      )

      console.log(`✅ Job atualizado: ${job.name}`)

      res.json({
        success: true,
        job,
        message: 'Job atualizado com sucesso'
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao atualizar job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao atualizar job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - DELETE
  // ═══════════════════════════════════════════════════════════

  /**
   * DELETE /api/cron/jobs/:id
   * Deletar job
   */
  async deleteJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params

      console.log(`🗑️ Deletando job: ${id}`)

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          error: 'ID inválido'
        })
        return
      }

      await cronManagementService.deleteJob(
        new mongoose.Types.ObjectId(id)
      )

      console.log(`✅ Job deletado: ${id}`)

      res.json({
        success: true,
        message: 'Job deletado com sucesso'
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao deletar job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao deletar job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - TOGGLE
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/jobs/:id/toggle
   * Ativar/Desativar job
   */
  async toggleJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params
      const { enabled } = req.body

      console.log(`🔄 Toggle job ${id}: ${enabled}`)

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          error: 'ID inválido'
        })
        return
      }

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Campo "enabled" deve ser boolean'
        })
        return
      }

      const job = await cronManagementService.toggleJob(
        new mongoose.Types.ObjectId(id),
        enabled
      )

      console.log(`✅ Job ${enabled ? 'ativado' : 'desativado'}: ${job.name}`)

      res.json({
        success: true,
        job,
        message: `Job ${enabled ? 'ativado' : 'desativado'} com sucesso`
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao toggle job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao toggle job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - TRIGGER
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/jobs/:id/trigger
   * Executar job manualmente
   */
  async triggerJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params

      console.log(`▶️ Executando job manualmente: ${id}`)

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          error: 'ID inválido'
        })
        return
      }

      const job = await CronJobConfig.findById(id)

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job não encontrado'
        })
        return
      }

      // Executar assíncronamente (não bloquear response)
      cronManagementService.executeJobManually(
        new mongoose.Types.ObjectId(id)
      ).catch(error => {
        console.error(`❌ Erro ao executar job ${id}:`, error)
      })

      console.log(`✅ Execução iniciada: ${job.name}`)

      res.json({
        success: true,
        message: `Execução de "${job.name}" iniciada com sucesso`,
        jobId: id
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao trigger job:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao executar job'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // JOBS - GET HISTORY BY ID
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/jobs/:id/history
   * Histórico de execuções de um job específico
   */
  /** 
* GET /api/cron/jobs/:id/history
 * Histórico de execuções de um job específico
 * 
 * ✅ VERSÃO CORRIGIDA - SUBSTITUIR O MÉTODO COMPLETO
 */
async getJobHistory(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { limit = '20', status } = req.query

    console.log(`📊 Buscando histórico do job: ${id}`)

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID inválido'
      })
      return
    }

    const filter: any = { jobId: id }
    if (status) filter.status = status

    const executions = await CronExecution.find(filter)
      .sort({ startedAt: -1 })
      .limit(parseInt(limit as string))
      .lean()

    // ✅ FIX: Verificar tipos corretos do CronExecution
    // CronExecution usa: 'success' | 'error' | 'running'
    // CronJobConfig usa: 'success' | 'failed' | 'partial' | 'running'
    const allExecutions = await CronExecution.find({ jobId: id }).lean()
    
    const stats = {
      total: allExecutions.length,
      success: allExecutions.filter(e => e.status === 'success').length,
      error: allExecutions.filter(e => e.status === 'error').length,  // ✅ 'error' não 'failed'
      running: allExecutions.filter(e => e.status === 'running').length,
      avgDuration: allExecutions.length > 0
        ? Math.round(
            allExecutions.reduce((sum, e) => sum + (e.duration ?? 0), 0) / allExecutions.length  // ✅ Usar ?? 0
          )
        : 0,
      successRate: allExecutions.length > 0
        ? Math.round(
            (allExecutions.filter(e => e.status === 'success').length / allExecutions.length) * 100
          )
        : 0
    }

    console.log(`✅ ${executions.length} execuções encontradas`)

    res.json({
      success: true,
      executions,
      stats
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar histórico'
    })
    return
  }
}

  // ═══════════════════════════════════════════════════════════
  // VALIDATE CRON EXPRESSION
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/cron/validate
   * Validar cron expression
   */
  async validateCronExpression(req: Request, res: Response): Promise<void> {
    try {
      const { cronExpression } = req.body

      console.log(`🔍 Validando cron expression: ${cronExpression}`)

      if (!cronExpression) {
        res.status(400).json({
          success: false,
          error: 'Campo "cronExpression" é obrigatório'
        })
        return
      }

      try {
        const nextRuns = cronManagementService.getNextExecutions(cronExpression, 5)

        console.log(`✅ Cron expression válida`)

        res.json({
          success: true,
          valid: true,
          nextExecutions: nextRuns,
          humanReadable: cronManagementService.cronToHumanReadable(cronExpression)
        })
        return
      } catch (validationError: any) {
        console.log(`❌ Cron expression inválida: ${validationError.message}`)

        res.status(400).json({
          success: false,
          valid: false,
          error: validationError.message
        })
        return
      }
    } catch (error: any) {
      console.error('❌ Erro ao validar cron:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao validar expressão'
      })
      return
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS GERAL
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/cron/status
   * Status geral do sistema CRON
   */
  async getCronStatus(req: Request, res: Response): Promise<void> {
    try {
      console.log('📊 Buscando status do sistema CRON...')

      const jobs = await CronJobConfig.find({ isActive: true }).lean()
      const executions = await CronExecution.find()
        .sort({ startedAt: -1 })
        .limit(10)
        .lean()

      const now = new Date()
      const upcomingJobs = jobs
        .filter(j => j.schedule.enabled && j.nextRun && j.nextRun > now)
        .sort((a, b) => (a.nextRun!.getTime() - b.nextRun!.getTime()))
        .slice(0, 5)
        .map(j => ({
          id: j._id,
          name: j.name,
          syncType: j.syncType,
          nextRun: j.nextRun,
          minutesUntil: Math.round((j.nextRun!.getTime() - now.getTime()) / 60000)
        }))

      const stats = {
        totalJobs: jobs.length,
        enabledJobs: jobs.filter(j => j.schedule.enabled).length,
        disabledJobs: jobs.filter(j => !j.schedule.enabled).length,
        totalExecutions: executions.length,
        successRate: jobs.length > 0
          ? Math.round(
              (jobs.reduce((sum, j) => sum + j.successfulRuns, 0) /
                jobs.reduce((sum, j) => sum + j.totalRuns, 0)) * 100
            ) || 0
          : 0,
        schedulerActive: cronManagementService.isSchedulerActive()
      }

      console.log(`✅ Status obtido`)

      res.json({
        success: true,
        stats,
        upcomingJobs,
        recentExecutions: executions
      })
      return
    } catch (error: any) {
      console.error('❌ Erro ao buscar status:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao buscar status'
      })
      return
    }
  }
}

export default new CronManagementController()