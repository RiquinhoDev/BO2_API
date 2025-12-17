// ================================================================
// 📁 src/controllers/reengagement.controller.ts
// CONTROLLER: Sistema de Re-engagement (Testes e Gestão)
// ================================================================

import { Request, Response } from 'express'
import decisionEngine from '../services/decisionEngine.service'
import tagOrchestrator from '../services/ac/tagOrchestrator.service'
import StudentEngagementState from '../models/StudentEngagementState'
import ProductProfile from '../models/ProductProfile'
import User from '../models/user'
import CommunicationHistory from '../models/CommunicationHistory'

/**
 * POST /api/reengagement/evaluate/:userId
 * Avaliar decisão para um aluno específico (TESTE)
 */
export const evaluateStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params
    const { productCode } = req.body

    if (!productCode) {
      res.status(400).json({
        success: false,
        error: 'productCode é obrigatório'
      })
      return
    }

    // Verificar se user existe
    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
      return
    }

    console.log(`🧪 [TESTE] Avaliando ${user.email} em ${productCode}`)

    // Avaliar decisão
    const decision = await decisionEngine.evaluateStudent(userId, productCode)

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        },
        productCode,
        decision,
        timestamp: new Date()
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao avaliar aluno:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao avaliar aluno',
      message: error.message
    })
  }
}

/**
 * POST /api/reengagement/evaluate/:userId/execute
 * Avaliar E EXECUTAR decisão para um aluno (TESTE)
 */
export const evaluateAndExecute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params
    const { productCode, dryRun } = req.body

    if (!productCode) {
      res.status(400).json({
        success: false,
        error: 'productCode é obrigatório'
      })
      return
    }

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
      return
    }

    console.log(`🧪 [TESTE] Avaliando e ${dryRun ? 'simulando' : 'executando'} para ${user.email}`)

    // Avaliar decisão
    const decision = await decisionEngine.evaluateStudent(userId, productCode)

    let executionResult = null

    // Executar se não for dry run
    if (!dryRun && decision.shouldExecute) {
      executionResult = await tagOrchestrator.executeDecision(userId, productCode, decision)
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        },
        productCode,
        decision,
        execution: executionResult || { dryRun: true, message: 'Não executado (dry run)' },
        timestamp: new Date()
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao avaliar e executar:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao avaliar e executar',
      message: error.message
    })
  }
}

/**
 * POST /api/reengagement/evaluate-batch
 * Avaliar múltiplos alunos de uma vez
 */
export const evaluateBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userIds, productCode } = req.body

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'userIds deve ser um array não vazio'
      })
      return
    }

    if (!productCode) {
      res.status(400).json({
        success: false,
        error: 'productCode é obrigatório'
      })
      return
    }

    console.log(`🧪 [TESTE] Avaliando ${userIds.length} alunos em ${productCode}`)

    const results = await decisionEngine.evaluateMultipleStudents(userIds, productCode)

    // Converter Map para objeto
    const resultsArray = Array.from(results.entries()).map(([userId, decision]) => ({
      userId,
      decision
    }))

    // Estatísticas
    const stats = {
      total: resultsArray.length,
      shouldExecute: resultsArray.filter(r => r.decision.shouldExecute).length,
      byAction: {} as any
    }

    resultsArray.forEach(r => {
      const action = r.decision.action
      stats.byAction[action] = (stats.byAction[action] || 0) + 1
    })

    res.json({
      success: true,
      data: {
        productCode,
        results: resultsArray,
        stats,
        timestamp: new Date()
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao avaliar batch:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao avaliar batch',
      message: error.message
    })
  }
}

/**
 * GET /api/reengagement/stats/:productCode
 * Obter estatísticas de decisões para um produto
 */
export const getDecisionStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productCode } = req.params

    const profile = await ProductProfile.findOne({ 
      code: productCode.toUpperCase() 
    })

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Perfil de produto não encontrado'
      })
      return
    }

    const stats = await decisionEngine.getDecisionStats(productCode)

    res.json({
      success: true,
      data: {
        productCode,
        profile: {
          name: profile.name,
          levels: profile.reengagementLevels.length
        },
        stats
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao obter estatísticas:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas',
      message: error.message
    })
  }
}

/**
 * GET /api/reengagement/state/:userId/:productCode
 * Obter estado de engagement de um aluno
 */
export const getStudentState = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, productCode } = req.params

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
      return
    }

    const state = await StudentEngagementState.findOne({
      userId,
      productCode: productCode.toUpperCase()
    })

    if (!state) {
      res.status(404).json({
        success: false,
        error: 'Estado de engagement não encontrado'
      })
      return
    }

    // Buscar histórico de comunicações
    const communications = await CommunicationHistory.find({
      userId,
      productCode: productCode.toUpperCase()
    }).sort({ sentAt: -1 }).limit(10)

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        },
        state,
        recentCommunications: communications
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao obter estado:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estado',
      message: error.message
    })
  }
}

/**
 * POST /api/reengagement/simulate/:productCode
 * Simular execução completa para um produto (DRY RUN)
 */
export const simulateProductRun = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productCode } = req.params
    const { limit = 100 } = req.body

    const profile = await ProductProfile.findOne({ 
      code: productCode.toUpperCase(),
      isActive: true 
    })

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Perfil de produto não encontrado ou inativo'
      })
      return
    }

    console.log(`🧪 [SIMULAÇÃO] Simulando execução para ${productCode} (limite: ${limit} alunos)`)

    // Buscar alunos que têm dados deste produto
    const users = await User.find({
      [`communicationByCourse.${productCode.toUpperCase()}`]: { $exists: true }
    }).limit(limit)

    console.log(`👥 ${users.length} alunos encontrados`)

    const results = []
    let stats = {
      total: 0,
      shouldExecute: 0,
      byAction: {} as any,
      byLevel: {} as any
    }

    for (const user of users) {
      const decision = await decisionEngine.evaluateStudent(user._id, productCode)
      
      results.push({
        userId: user._id,
        email: user.email,
        decision
      })

      stats.total++
      
      if (decision.shouldExecute) {
        stats.shouldExecute++
      }

      stats.byAction[decision.action] = (stats.byAction[decision.action] || 0) + 1
      
      if (decision.level) {
        stats.byLevel[decision.level] = (stats.byLevel[decision.level] || 0) + 1
      }
    }

    res.json({
      success: true,
      data: {
        productCode,
        profile: {
          name: profile.name,
          levels: profile.reengagementLevels
        },
        simulation: {
          studentsAnalyzed: users.length,
          stats,
          results: results.slice(0, 50) // Retornar só primeiros 50 para não sobrecarregar
        },
        note: results.length > 50 ? `Mostrando apenas 50 de ${results.length} resultados` : undefined
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao simular execução:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao simular execução',
      message: error.message
    })
  }
}

/**
 * POST /api/reengagement/reset/:userId/:productCode
 * Resetar estado de engagement de um aluno (TESTE)
 */
export const resetStudentState = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, productCode } = req.params

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
      return
    }

    // Deletar estado
    await StudentEngagementState.deleteOne({
      userId,
      productCode: productCode.toUpperCase()
    })

    console.log(`🔄 Estado resetado para ${user.email} em ${productCode}`)

    res.json({
      success: true,
      message: 'Estado de engagement resetado',
      data: {
        userId,
        email: user.email,
        productCode
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao resetar estado:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao resetar estado',
      message: error.message
    })
  }
}

