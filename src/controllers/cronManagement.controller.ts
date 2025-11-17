// ================================================================
// 🎮 CRON MANAGEMENT CONTROLLER
// ================================================================
// Controller para endpoints de gestão de CRON
// ================================================================

import { Request, Response } from 'express'
import cronManagementService from '../services/cronManagement.service'

class CronManagementController {
  /**
   * GET /api/cron/config
   * Obtém configuração atual do cron
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

  /**
   * PUT /api/cron/config
   * Atualiza configuração do cron
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

  /**
   * GET /api/cron/history
   * Obtém histórico de execuções
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

  /**
   * GET /api/cron/statistics
   * Obtém estatísticas
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
}

export default new CronManagementController()

