// ════════════════════════════════════════════════════════════════════════════
// 📁 src/controllers/acTags/cronManagement.controller.ts
// Controller: CRON Management System (VERSÃO COMPLETA HÍBRIDA)
// Combina: Tag Rules Sync (antigo) + CRON Jobs Management (novo)
// ════════════════════════════════════════════════════════════════════════════

import { Request, Response, RequestHandler } from 'express'
import mongoose from 'mongoose'
import cronManagementService from '../../services/cron/cronManagement.service'
import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import { CronExecution } from '../../models'
import syncSchedulerService from '../../services/cron/scheduler'
import type { CronTagsExecuteInput } from '../../security/cronTagsDestructiveInput'



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
  async executeNow(input: CronTagsExecuteInput, res: Response): Promise<void> {
    try {
      console.log('🔥 [API] POST /api/cron/execute (MANUAL - INTELIGENTE)')
      
      const userId = input.body.userId // Assumindo que vem do auth middleware

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
  async executeLegacy(input: CronTagsExecuteInput, res: Response): Promise<void> {
    try {
      console.log('🔥 [API] POST /api/cron/execute-legacy (MANUAL - LEGADO)')
      
      const userId = input.body.userId

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
  // JOB HISTORY BY ID (único endpoint de jobs montado em cron-tags)
  /**
   * GET /api/cron/jobs/:id/history
   * Histórico de execuções de um job específico
   */
  getJobHistory = async (
    req: Request<{ id: string }>,
    res: Response,
  ): Promise<void> => {
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
        executions: history, // Mudou de "history" para "executions" para clareza
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
