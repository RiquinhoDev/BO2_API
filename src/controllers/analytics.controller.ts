// src/controllers/analytics.controller.ts - VERSÃO COMPLETA FINAL MELHORADA
import { Request, Response } from 'express'
import { analyticsService } from '../services/analytics/analyticsService'
import User from '../models/user'
import { calculateCombinedEngagement } from '../utils/engagementCalculator'

// Cache simples para evitar recálculos frequentes
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

// Função para limpar cache expirado
const cleanExpiredCache = () => {
  const now = Date.now()
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key)
    }
  }
}

// Executar limpeza a cada 10 minutos
setInterval(cleanExpiredCache, 10 * 60 * 1000)
interface ComparisonOk {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  healthScore: number
  averageProgress: number
  lastCalculated: string
}

interface ComparisonErr {
  classId: string
  error: string
}
// Tipo Priority já definido no início do arquivo
type Priority = 'high' | 'medium' | 'low' | 'info'

// Interface local com tipo específico
interface OpportunityItem {
  type: string
  priority: Priority  // ← Tipo específico em vez de string genérico
  title: string
  description: string
  suggestion: string
  impact: string
}

type Comparison = ComparisonOk | ComparisonErr

// Type guard para o TS perceber quais são válidos
const isOk = (c: Comparison): c is ComparisonOk => !('error' in c)

// ✅ ENDPOINT PRINCIPAL - ANALYTICS DE UMA TURMA (COM CACHE)
export const getClassAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    const forceRecalculate = req.query.force === 'true'
    
    console.log(`📊 [CONTROLLER] Solicitando analytics para turma: ${classId}`)
    if (forceRecalculate) {
      console.log(`🔄 [CONTROLLER] Recálculo forçado solicitado`)
    }

    // Usar o serviço de analytics que tem cache inteligente
    const analytics = await analyticsService.getClassAnalytics(classId, forceRecalculate)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }

    // Adicionar informações de cache na resposta
    const now = new Date()
    const cacheAge = Math.floor((now.getTime() - analytics.lastCalculatedAt.getTime()) / (1000 * 60)) // em minutos
   const defaultCacheHours = 6 // valor padrão de 6 horas
const isCached = !forceRecalculate && cacheAge < defaultCacheHours * 60

    console.log(`✅ [CONTROLLER] Analytics retornados com sucesso`)
    console.log(`   - Total de alunos: ${analytics.totalStudents}`)
    console.log(`   - Engagement médio: ${analytics.averageEngagement}%`)
    console.log(`   - Health Score: ${analytics.healthScore}`)
    console.log(`   - Cache: ${isCached ? `${cacheAge}min` : 'Recalculado'}`)

    res.status(200).json({
      success: true,
      data: analytics,
      meta: {
        cached: isCached,
        cacheAge: cacheAge,
        lastCalculated: analytics.lastCalculatedAt,
        calculationDuration: analytics.calculationDuration,
        studentsProcessed: analytics.studentsProcessed
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao buscar analytics da turma:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor ao buscar analytics da turma',
      error: error.message
    })
  }
}

// ✅ ENDPOINT PARA FORÇAR RECÁLCULO DOS SCORES
export const recalculateClassScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`🔄 [CONTROLLER] Forçando recálculo para turma: ${classId}`)

    // Forçar recálculo usando o serviço
    const analytics = await analyticsService.recalculateClass(classId)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }

    console.log(`✅ [CONTROLLER] Recálculo concluído para turma ${classId}`)
    console.log(`   - Alunos processados: ${analytics.studentsProcessed}`)
    console.log(`   - Tempo de cálculo: ${analytics.calculationDuration}ms`)

    res.status(200).json({
      success: true,
      message: `Analytics recalculados com sucesso para a turma ${classId}`,
      data: {
        classId: analytics.classId,
        studentsProcessed: analytics.studentsProcessed,
        calculationDuration: analytics.calculationDuration,
        newAverageEngagement: analytics.averageEngagement,
        newHealthScore: analytics.healthScore
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao recalcular scores:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao recalcular analytics da turma',
      error: error.message
    })
  }
}

// ✅ ENDPOINT PARA LISTAR TURMAS QUE PRECISAM DE ATUALIZAÇÃO
export const getOutdatedClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`🔍 [CONTROLLER] Verificando turmas com cache desatualizado`)

    const outdatedClasses = await analyticsService.getClassesThatNeedUpdate()
    
    console.log(`📋 [CONTROLLER] Encontradas ${outdatedClasses.length} turmas desatualizadas`)

    res.status(200).json({
      success: true,
      data: {
        count: outdatedClasses.length,
        classes: outdatedClasses
      },
      message: `${outdatedClasses.length} turmas precisam de atualização`,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao listar turmas desatualizadas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar turmas desatualizadas',
      error: error.message
    })
  }
}


// ✅ ENDPOINT PARA OBTER HEALTH SCORE ESPECÍFICO
export const getHealthScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`💊 [CONTROLLER] Buscando health score para turma: ${classId}`)

    const analytics = await analyticsService.getClassAnalytics(classId)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }

    const healthData = {
      classId: analytics.classId,
      className: analytics.className,
      healthScore: analytics.healthScore,
      healthFactors: analytics.healthFactors,
      totalStudents: analytics.totalStudents,
      lastCalculated: analytics.lastCalculatedAt
    }

    console.log(`✅ [CONTROLLER] Health score retornado: ${analytics.healthScore}`)

    res.status(200).json({
      success: true,
      data: healthData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao buscar health score:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar health score da turma',
      error: error.message
    })
  }
}

// ✅ ENDPOINT PARA OBTER APENAS DISTRIBUIÇÃO DE ENGAGEMENT
export const getEngagementDistribution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`📊 [CONTROLLER] Buscando distribuição de engagement para turma: ${classId}`)

    const analytics = await analyticsService.getClassAnalytics(classId)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }

    const distributionData = {
      classId: analytics.classId,
      className: analytics.className,
      totalStudents: analytics.totalStudents,
      averageEngagement: analytics.averageEngagement,
      distribution: analytics.engagementDistribution,
      lastCalculated: analytics.lastCalculatedAt
    }

    console.log(`✅ [CONTROLLER] Distribuição retornada:`, analytics.engagementDistribution)

    res.status(200).json({
      success: true,
      data: distributionData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao buscar distribuição:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar distribuição de engagement',
      error: error.message
    })
  }
}

// ✅ ENDPOINT PARA OBTER ALERTAS DA TURMA
export const getClassAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`🚨 [CONTROLLER] Buscando alertas para turma: ${classId}`)

    const analytics = await analyticsService.getClassAnalytics(classId)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }

    const alertsData = {
      classId: analytics.classId,
      className: analytics.className,
      totalAlerts: analytics.alerts.length,
      alerts: analytics.alerts,
      lastCalculated: analytics.lastCalculatedAt
    }

    console.log(`✅ [CONTROLLER] ${analytics.alerts.length} alertas retornados`)

    res.status(200).json({
      success: true,
      data: alertsData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao buscar alertas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar alertas da turma',
      error: error.message
    })
  }
}

// ✅ ENDPOINT PARA ESTATÍSTICAS RÁPIDAS (SEM CACHE PESADO)
export const getQuickStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`⚡ [CONTROLLER] Buscando stats rápidos para turma: ${classId}`)

    // Buscar dados básicos sem cache pesado
    const totalStudents = await User.countDocuments({ 
      classId: classId,
      isDeleted: { $ne: true }
    })
    
    const activeStudents = await User.countDocuments({ 
      classId: classId,
      status: 'ACTIVE',
      isDeleted: { $ne: true }
    })

    if (totalStudents === 0) {
      res.status(200).json({
        success: true,
        data: {
          classId,
          totalStudents: 0,
          activeStudents: 0,
          message: 'Turma sem alunos'
        }
      })
      return
    }

    const quickStats = {
      classId,
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      activityRate: Math.round((activeStudents / totalStudents) * 100)
    }

    console.log(`✅ [CONTROLLER] Stats rápidos calculados`)

    res.status(200).json({
      success: true,
      data: quickStats,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao buscar stats rápidos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas rápidas',
      error: error.message
    })
  }
}
// ================================================================================================
// 🚀 NOVOS ENDPOINTS PARA ADICIONAR AO analytics.controller.ts EXISTENTE
// ================================================================================================

// ✅ 1. ENDPOINT PARA RECALCULAR SCORES INDIVIDUAIS DOS ALUNOS
export const recalculateIndividualScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`🔄 [CONTROLLER] Recalculando scores individuais para turma: ${classId}`)

    // Importar aqui para evitar dependência circular
    const User = require('../models/user').default
    const { calculateCombinedEngagement } = require('../utils/engagementCalculator')

    // Buscar alunos da turma
    const students = await User.find({ 
      classId: classId,
      isDeleted: { $ne: true }
    })
    
    if (students.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Nenhum aluno encontrado na turma'
      })
      return
    }
    
    let updated = 0
    const results = []
    const startTime = Date.now()
    
    for (const student of students) {
      console.log(`📊 Recalculando para aluno: ${student.name || student.email}`)
      
      try {
        // Calcular novo engagement score
        const engagementResult = calculateCombinedEngagement({
          engagement: student.engagement,
          accessCount: student.accessCount,
          progress: student.progress
        })
        
        // Atualizar na base de dados
        await User.findByIdAndUpdate(student._id, {
          engagementScore: engagementResult.score,
          engagementLevel: engagementResult.level,
          engagementCalculatedAt: new Date(),
          lastScoreUpdate: new Date()
        })
        
        updated++
        results.push({
          studentId: student._id,
          name: student.name || student.email,
          oldScore: student.engagementScore || 0,
          newScore: engagementResult.score,
          oldLevel: student.engagementLevel || 'baixo',
          newLevel: engagementResult.level
        })
        
      } catch (error: any) {
        console.error(`❌ Erro ao atualizar aluno ${student._id}:`, error)
        results.push({
          studentId: student._id,
          name: student.name || student.email,
          error: error.message
        })
      }
    }
    
    const duration = Date.now() - startTime
    
    console.log(`✅ [CONTROLLER] Scores individuais recalculados: ${updated}/${students.length}`)

    res.status(200).json({
      success: true,
      message: `Scores recalculados para ${updated} de ${students.length} alunos`,
      data: {
        classId,
        totalStudents: students.length,
        successfulUpdates: updated,
        failedUpdates: students.length - updated,
        calculationDuration: duration,
        results: results
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao recalcular scores individuais:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao recalcular scores individuais da turma',
      error: error.message
    })
  }
}

// ✅ 2. ENDPOINT PARA ANALYTICS GLOBAIS (TODAS AS TURMAS) - MELHORADO
// ✅ getGlobalAnalytics - VERSÃO CORRIGIDA COMPLETA COM CACHE
export const getGlobalAnalytics = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now()
  
  try {
    console.log(`🌍 [CONTROLLER] Calculando analytics globais`)
    
    // Verificar cache primeiro
    const cacheKey = 'global-analytics'
    const cached = cache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('📦 [CONTROLLER] Retornando analytics globais do cache')
      res.status(200).json({
        success: true,
        data: cached.data,
        cached: true,
        timestamp: new Date(cached.timestamp).toISOString(),
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000)
      })
      return
    }
    
    // Importar modelos
    const User = require('../models/user').default
    const { Class } = require('../models/Class')
    
    // Buscar todas as turmas ativas
    const activeClasses = await Class.find({ 
      $or: [
        { isActive: true },
        { status: 'active' }
      ]
    }).lean()
    
    if (activeClasses.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          message: 'Nenhuma turma ativa encontrada',
          totalClasses: 0
        }
      })
      return
    }
    
    // Calcular métricas globais
    const classIds = activeClasses.map(c => c.classId)
    
    const totalStudents = await User.countDocuments({
      classId: { $in: classIds },
      isDeleted: { $ne: true }
    })
    
    const activeStudents = await User.countDocuments({
      classId: { $in: classIds },
      $or: [
        { status: 'ACTIVE' },
        { status: 'active' },
        { status: { $exists: false } } // Considerar ativos se não tiver status definido
      ],
      isDeleted: { $ne: true }
    })
    
    // Distribuição de engagement global - VERSÃO CORRIGIDA
    const engagementDistribution = await User.aggregate([
      {
        $match: {
          classId: { $in: classIds },
          isDeleted: { $ne: true }
        }
      },
      {
        $addFields: {
          // Calcular nível baseado no engagementScore
          calculatedLevel: {
            $switch: {
              branches: [
                { case: { $gte: ['$engagementScore', 80] }, then: 'muito_alto' },
                { case: { $gte: ['$engagementScore', 60] }, then: 'alto' },
                { case: { $gte: ['$engagementScore', 40] }, then: 'medio' },
                { case: { $gte: ['$engagementScore', 20] }, then: 'baixo' },
                { case: { $lt: ['$engagementScore', 20] }, then: 'muito_baixo' }
              ],
              default: 'muito_baixo'
            }
          }
        }
      },
      {
        $group: {
          _id: '$calculatedLevel',
          count: { $sum: 1 }
        }
      }
    ])
    
    // ✅ CORREÇÃO APLICADA: Converter para formato esperado
    const distribution = {
      muito_alto: 0,
      alto: 0,
      medio: 0,
      baixo: 0,
      muito_baixo: 0
    }
    
    // ✅ VERSÃO CORRIGIDA DO FOREACH:
    engagementDistribution.forEach(item => {
      const validLevels: (keyof typeof distribution)[] = [
        'muito_alto', 'alto', 'medio', 'baixo', 'muito_baixo'
      ]
      
      if (validLevels.includes(item._id)) {
        distribution[item._id as keyof typeof distribution] = item.count
      }
    })
    
    // Média de engagement global
    const avgEngagementResult = await User.aggregate([
      {
        $match: {
          classId: { $in: classIds },
          isDeleted: { $ne: true },
          engagementScore: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageEngagement: { $avg: '$engagementScore' }
        }
      }
    ])
    
    const averageEngagement = avgEngagementResult.length > 0 
      ? Math.round(avgEngagementResult[0].averageEngagement) 
      : 0
    
    const duration = Date.now() - startTime
    
    const globalData = {
      totalClasses: activeClasses.length,
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      activityRate: totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0,
      averageEngagement,
      engagementDistribution: distribution,
      calculationDuration: duration,
      lastUpdated: new Date().toISOString()
    }
    
    // Atualizar cache
    cache.set(cacheKey, {
      data: globalData,
      timestamp: Date.now()
    })
    
    console.log(`✅ [CONTROLLER] Analytics globais calculados em ${duration}ms`)
    
    res.status(200).json({
      success: true,
      data: globalData,
      cached: false,
      timestamp: new Date().toISOString(),
      calculationDuration: duration
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao calcular analytics globais:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular analytics globais',
      error: error.message
    })
  }
}

// ✅ 3. ENDPOINT PARA COMPARAR MÚLTIPLAS TURMAS - MELHORADO
export const compareClasses = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now()
  
  try {
    const { classIds } = req.query

    // Validações melhoradas
    if (!classIds || typeof classIds !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Parâmetro classIds é obrigatório (formato: ?classIds=id1,id2,id3)',
        timestamp: new Date().toISOString()
      })
      return
    }

    const classIdArray = classIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id)

    if (classIdArray.length < 2) {
      res.status(400).json({
        success: false,
        message: 'Pelo menos 2 turmas são necessárias para comparação',
        timestamp: new Date().toISOString()
      })
      return
    }

    if (classIdArray.length > 10) {
      res.status(400).json({
        success: false,
        message: 'Máximo de 10 turmas por comparação',
        timestamp: new Date().toISOString()
      })
      return
    }

    // Verificar cache
    const cacheKey = `comparison-${classIds}`
    const cached = cache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('📦 [CONTROLLER] Retornando comparação do cache')
      res.status(200).json({
        success: true,
        data: cached.data,
        cached: true,
        timestamp: new Date(cached.timestamp).toISOString(),
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000)
      })
      return
    }

    console.log(`📊 [CONTROLLER] Comparando ${classIdArray.length} turmas:`, classIdArray)

    // Buscar analytics de cada turma em paralelo
    const comparisons: Comparison[] = await Promise.all(
      classIdArray.map(async (classId): Promise<Comparison> => {
        try {
          const analytics = await analyticsService.getClassAnalytics(classId)

          if (analytics) {
            return {
              classId: analytics.classId,
              className: analytics.className,
              totalStudents: analytics.totalStudents,
              activeStudents: analytics.activeStudents,
              averageEngagement: analytics.averageEngagement,
              healthScore: analytics.healthScore,
              averageProgress: analytics.averageProgress,
              // garante string
              lastCalculated: String(analytics.lastCalculatedAt ?? ''),
            }
          }

          return { classId, error: 'Turma não encontrada' }
        } catch (error: any) {
          return { classId, error: error?.message ?? 'Erro desconhecido' }
        }
      }),
    )

    // Apenas válidas para estatísticas
    const validComparisons: ComparisonOk[] = comparisons.filter(isOk)

    if (validComparisons.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Nenhuma turma válida encontrada para comparação',
      })
      return
    }

    // Estatísticas agregadas (com tipos garantidos)
    const stats = {
      totalStudentsSum: validComparisons.reduce((sum, c) => sum + c.totalStudents, 0),
      averageEngagementMean: Math.round(
        validComparisons.reduce((sum, c) => sum + c.averageEngagement, 0) / validComparisons.length,
      ),
      healthScoreMean: Math.round(
        validComparisons.reduce((sum, c) => sum + c.healthScore, 0) / validComparisons.length,
      ),
      bestPerformingClass: validComparisons.reduce((best, current) =>
        current.healthScore > best.healthScore ? current : best,
      ),
      worstPerformingClass: validComparisons.reduce((worst, current) =>
        current.healthScore < worst.healthScore ? current : worst,
      ),
    }

    const responseData = {
      comparisons, // contém válidas e com erro (útil para UI)
      summary: stats,
      validComparisons: validComparisons.length,
      totalRequested: classIdArray.length,
      calculationDuration: Date.now() - startTime,
      lastUpdated: new Date().toISOString()
    }

    // Atualizar cache
    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    })

    console.log(`✅ [CONTROLLER] Comparação concluída para ${validComparisons.length} turmas em ${Date.now() - startTime}ms`)

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      timestamp: new Date().toISOString(),
      calculationDuration: Date.now() - startTime
    })
  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao comparar turmas:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao comparar turmas',
      error: error?.message ?? String(error),
    })
  }
}

// ✅ 4. ENDPOINT PARA OPORTUNIDADES DE MELHORIA
export const getOpportunities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`💡 [CONTROLLER] Analisando oportunidades para turma: ${classId}`)
    
    const analytics = await analyticsService.getClassAnalytics(classId)
    
    if (!analytics) {
      res.status(404).json({
        success: false,
        message: 'Turma não encontrada'
      })
      return
    }
    
    // Interface para as oportunidades com tipo de prioridade bem definido
    interface OpportunityItem {
      type: string
      priority: Priority
      title: string
      description: string
      suggestion: string
      impact: string
    }
    
    const opportunities: OpportunityItem[] = []
    
    // 1. Análise de Low Engagement
    if (analytics.averageEngagement < 50) {
      opportunities.push({
        type: 'engagement',
        priority: 'high',
        title: 'Engagement Baixo',
        description: `O engagement médio da turma (${analytics.averageEngagement}%) está abaixo da média recomendada (50%)`,
        suggestion: 'Considere enviar mensagens de motivação ou criar conteúdo mais interativo',
        impact: 'Alto'
      })
    }
    
    // 2. Análise de Alunos Inativos
    if (analytics.totalStudents > 0) {
      const inactiveRate = ((analytics.totalStudents - analytics.activeStudents) / analytics.totalStudents) * 100
      if (inactiveRate > 30) {
        opportunities.push({
          type: 'activity',
          priority: 'high',
          title: 'Muitos Alunos Inativos',
          description: `${Math.round(inactiveRate)}% dos alunos estão inativos`,
          suggestion: 'Implemente uma campanha de reativação ou analise as barreiras de acesso',
          impact: 'Alto'
        })
      }
    }
    
    // 3. Análise de Progresso Baixo
    if (analytics.averageProgress < 40) {
      opportunities.push({
        type: 'progress',
        priority: 'medium',
        title: 'Progresso Lento',
        description: `O progresso médio da turma (${analytics.averageProgress}%) pode ser melhorado`,
        suggestion: 'Considere criar marcos intermediários ou gamificação para motivar os alunos',
        impact: 'Médio'
      })
    }
    
    // 4. Análise de Health Score
    if (analytics.healthScore < 60) {
      opportunities.push({
        type: 'health',
        priority: 'high',
        title: 'Health Score Baixo',
        description: `O health score da turma (${analytics.healthScore}) indica problemas estruturais`,
        suggestion: 'Revise a estratégia geral da turma e analise os fatores específicos do health score',
        impact: 'Alto'
      })
    }
    
    // 5. Análise da Distribuição de Engagement
    const dist = analytics.engagementDistribution
    const lowEngagementCount = (dist.baixo || 0) + (dist.muito_baixo || 0)
    if (analytics.totalStudents > 0) {
      const lowEngagementPercentage = (lowEngagementCount / analytics.totalStudents) * 100
      if (lowEngagementPercentage > 40) {
        opportunities.push({
          type: 'distribution',
          priority: 'medium',
          title: 'Concentração de Baixo Engagement',
          description: `${Math.round(lowEngagementPercentage)}% dos alunos têm engagement baixo ou muito baixo`,
          suggestion: 'Segmente estes alunos para ações específicas de engagement e suporte personalizado',
          impact: 'Médio'
        })
      }
    }
    
    // 6. Análise de Distribuição de Progresso (se disponível)
    if (analytics.averageProgress > 0 && analytics.averageProgress < 25) {
      opportunities.push({
        type: 'progress_critical',
        priority: 'high',
        title: 'Progresso Crítico',
        description: `O progresso médio está muito baixo (${analytics.averageProgress}%)`,
        suggestion: 'Intervenção urgente necessária - revise conteúdo e métodos de ensino',
        impact: 'Crítico'
      })
    }
    
    // 7. Análise de Retenção (baseada em fatores de health)
    if (analytics.healthFactors && analytics.healthFactors.retention < 50) {
      opportunities.push({
        type: 'retention',
        priority: 'high',
        title: 'Problemas de Retenção',
        description: `O fator de retenção está baixo (${analytics.healthFactors.retention})`,
        suggestion: 'Analise os padrões de abandono e implemente estratégias de retenção',
        impact: 'Alto'
      })
    }
    
    // 8. Oportunidades de Moderado Engagement
    if (analytics.averageEngagement >= 50 && analytics.averageEngagement < 70) {
      opportunities.push({
        type: 'engagement_improvement',
        priority: 'medium',
        title: 'Engagement Moderado',
        description: `O engagement está na média (${analytics.averageEngagement}%) mas pode ser otimizado`,
        suggestion: 'Implemente técnicas avançadas de gamificação ou conteúdo interativo',
        impact: 'Médio'
      })
    }
    
    // 9. Análise de Atividade Baixa vs Alta
    if (analytics.totalStudents > 0) {
      const activityRate = (analytics.activeStudents / analytics.totalStudents) * 100
      if (activityRate >= 70 && activityRate < 90) {
        opportunities.push({
          type: 'activity_optimization',
          priority: 'low',
          title: 'Otimização de Atividade',
          description: `Taxa de atividade boa (${Math.round(activityRate)}%) mas pode chegar a excelência`,
          suggestion: 'Identifique os últimos alunos inativos e crie campanhas direcionadas',
          impact: 'Baixo'
        })
      }
    }
    
    // 10. Insights Positivos
    if (analytics.averageEngagement > 70) {
      opportunities.push({
        type: 'success',
        priority: 'info',
        title: 'Engagement Excelente',
        description: `A turma tem engagement excelente de ${analytics.averageEngagement}%`,
        suggestion: 'Mantenha as estratégias atuais e considere documentar as melhores práticas para replicar em outras turmas',
        impact: 'Positivo'
      })
    }
    
    if (analytics.healthScore > 80) {
      opportunities.push({
        type: 'excellence',
        priority: 'info',
        title: 'Turma de Alta Performance',
        description: `Health score excelente (${analytics.healthScore}) indica uma turma muito bem gerida`,
        suggestion: 'Use esta turma como referência e case study para outras turmas',
        impact: 'Referência'
      })
    }
    
    // 11. Análise de Balanceamento
    if (analytics.totalStudents > 0) {
      const highEngagementCount = (dist.muito_alto || 0) + (dist.alto || 0)
      const highEngagementPercentage = (highEngagementCount / analytics.totalStudents) * 100
      
      if (highEngagementPercentage > 60) {
        opportunities.push({
          type: 'balance',
          priority: 'info',
          title: 'Distribuição Positiva',
          description: `${Math.round(highEngagementPercentage)}% dos alunos têm alto engagement`,
          suggestion: 'Aproveite os alunos engajados como mentores para os demais',
          impact: 'Estratégico'
        })
      }
    }
    
    // Ordenação por prioridade usando o tipo correto
    const priorityOrder: Record<Priority, number> = {
      high: 1,
      medium: 2,
      low: 3,
      info: 4
    }
    
    opportunities.sort((a, b) => {
      const priorityA = priorityOrder[a.priority]
      const priorityB = priorityOrder[b.priority]
      return priorityA - priorityB
    })
    
    console.log(`✅ [CONTROLLER] ${opportunities.length} oportunidades identificadas`)
    
    // Construir resposta completa
    const responseData = {
      classId: analytics.classId,
      className: analytics.className,
      totalOpportunities: opportunities.length,
      opportunities,
      classMetrics: {
        totalStudents: analytics.totalStudents,
        activeStudents: analytics.activeStudents,
        averageEngagement: analytics.averageEngagement,
        healthScore: analytics.healthScore,
        averageProgress: analytics.averageProgress
      },
      summary: {
        highPriority: opportunities.filter(o => o.priority === 'high').length,
        mediumPriority: opportunities.filter(o => o.priority === 'medium').length,
        lowPriority: opportunities.filter(o => o.priority === 'low').length,
        positiveInsights: opportunities.filter(o => o.priority === 'info').length
      },
      analysisDate: new Date().toISOString()
    }
    
    res.status(200).json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao analisar oportunidades:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao analisar oportunidades de melhoria',
      error: error.message
    })
  }
}
export const getBenchmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`📈 [CONTROLLER] Calculando benchmarks da indústria`)
    
    // Importar modelos
    const User = require('../models/user').default
    const { Class } = require('../models/Class')
    
    const startTime = Date.now()
    
    // Buscar todas as turmas ativas para calcular benchmarks
    const activeClasses = await Class.find({ 
      $or: [
        { isActive: true },
        { status: 'active' }
      ]
    }).lean()
    
    if (activeClasses.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          message: 'Nenhuma turma ativa encontrada para calcular benchmarks',
          totalClasses: 0
        }
      })
      return
    }
    
    const classIds = activeClasses.map(c => c.classId)
    
    // Calcular métricas de todas as turmas para benchmarks
    const allClassesAnalytics = []
    
    for (const classData of activeClasses) {
      try {
        // Buscar dados básicos da turma
        const totalStudents = await User.countDocuments({
          classId: classData.classId,
          isDeleted: { $ne: true }
        })
        
        const activeStudents = await User.countDocuments({
          classId: classData.classId,
          status: 'ACTIVE',
          isDeleted: { $ne: true }
        })
        
        if (totalStudents === 0) continue
        
        // Calcular engagement médio da turma
        const avgEngagementResult = await User.aggregate([
          {
            $match: {
              classId: classData.classId,
              isDeleted: { $ne: true },
              engagementScore: { $exists: true, $ne: null }
            }
          },
          {
            $group: {
              _id: null,
              averageEngagement: { $avg: '$engagementScore' },
              averageProgress: { $avg: '$progress' }
            }
          }
        ])
        
        const classMetrics = {
          classId: classData.classId,
          className: classData.name || 'Turma sem nome',
          totalStudents,
          activeStudents,
          activityRate: Math.round((activeStudents / totalStudents) * 100),
          averageEngagement: avgEngagementResult.length > 0 ? Math.round(avgEngagementResult[0].averageEngagement) : 0,
          averageProgress: avgEngagementResult.length > 0 ? Math.round(avgEngagementResult[0].averageProgress) : 0
        }
        
        allClassesAnalytics.push(classMetrics)
        
      } catch (error) {
        console.error(`Erro ao processar turma ${classData.classId}:`, error)
        continue
      }
    }
    
    if (allClassesAnalytics.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          message: 'Nenhuma turma com dados válidos encontrada',
          totalClasses: 0
        }
      })
      return
    }
    
    // Calcular benchmarks baseados nos percentis
    const engagementScores = allClassesAnalytics.map(c => c.averageEngagement).sort((a, b) => a - b)
    const progressScores = allClassesAnalytics.map(c => c.averageProgress).sort((a, b) => a - b)
    const activityRates = allClassesAnalytics.map(c => c.activityRate).sort((a, b) => a - b)
    const studentCounts = allClassesAnalytics.map(c => c.totalStudents).sort((a, b) => a - b)
    
    // Função para calcular percentis
    const getPercentile = (sortedArray: number[], percentile: number): number => {
      const index = Math.ceil((percentile / 100) * sortedArray.length) - 1
      return sortedArray[Math.max(0, index)] || 0
    }
    
    // Calcular diferentes níveis de benchmark
    const benchmarks = {
      engagement: {
        excellent: getPercentile(engagementScores, 90),      // Top 10%
        good: getPercentile(engagementScores, 75),           // Top 25%
        average: getPercentile(engagementScores, 50),        // Mediana
        needsImprovement: getPercentile(engagementScores, 25), // Bottom 25%
        poor: getPercentile(engagementScores, 10)            // Bottom 10%
      },
      progress: {
        excellent: getPercentile(progressScores, 90),
        good: getPercentile(progressScores, 75),
        average: getPercentile(progressScores, 50),
        needsImprovement: getPercentile(progressScores, 25),
        poor: getPercentile(progressScores, 10)
      },
      activityRate: {
        excellent: getPercentile(activityRates, 90),
        good: getPercentile(activityRates, 75),
        average: getPercentile(activityRates, 50),
        needsImprovement: getPercentile(activityRates, 25),
        poor: getPercentile(activityRates, 10)
      },
      classSize: {
        large: getPercentile(studentCounts, 90),
        medium: getPercentile(studentCounts, 50),
        small: getPercentile(studentCounts, 25)
      }
    }
    
    // Identificar turmas de alto desempenho (top 25% em engagement E progress)
    const topPerformers = allClassesAnalytics.filter(c => 
      c.averageEngagement >= benchmarks.engagement.good && 
      c.averageProgress >= benchmarks.progress.good
    ).slice(0, 10) // Top 10 performers
    
    // Identificar turmas que precisam de atenção (bottom 25% em engagement OU progress)
    const needsAttention = allClassesAnalytics.filter(c => 
      c.averageEngagement <= benchmarks.engagement.needsImprovement || 
      c.averageProgress <= benchmarks.progress.needsImprovement
    ).slice(0, 10) // Bottom 10 performers
    
    // Estatísticas da indústria (baseadas nos dados actuais)
    const industryStats = {
      totalClasses: allClassesAnalytics.length,
      totalStudents: allClassesAnalytics.reduce((sum, c) => sum + c.totalStudents, 0),
      averageClassSize: Math.round(allClassesAnalytics.reduce((sum, c) => sum + c.totalStudents, 0) / allClassesAnalytics.length),
      overallEngagement: Math.round(allClassesAnalytics.reduce((sum, c) => sum + c.averageEngagement, 0) / allClassesAnalytics.length),
      overallProgress: Math.round(allClassesAnalytics.reduce((sum, c) => sum + c.averageProgress, 0) / allClassesAnalytics.length),
      overallActivityRate: Math.round(allClassesAnalytics.reduce((sum, c) => sum + c.activityRate, 0) / allClassesAnalytics.length)
    }
    
    // Insights automáticos
    const insights = []
    
    if (industryStats.overallEngagement < 50) {
      insights.push({
        type: 'warning',
        message: `O engagement médio da plataforma (${industryStats.overallEngagement}%) está abaixo do ideal (50%+)`,
        recommendation: 'Considere implementar estratégias globais de engagement'
      })
    }
    
    if (industryStats.overallActivityRate < 80) {
      insights.push({
        type: 'info',
        message: `A taxa de atividade média (${industryStats.overallActivityRate}%) pode ser melhorada`,
        recommendation: 'Analise campanhas de reativação para alunos inativos'
      })
    }
    
    if (topPerformers.length > 0) {
      insights.push({
        type: 'success',
        message: `${topPerformers.length} turmas estão com performance excellent`,
        recommendation: 'Analise as melhores práticas dessas turmas para replicar'
      })
    }
    
    const duration = Date.now() - startTime
    
    const benchmarkData = {
      benchmarks,
      industryStats,
      topPerformers,
      needsAttention,
      insights,
      metadata: {
        calculationDate: new Date().toISOString(),
        classesAnalyzed: allClassesAnalytics.length,
        calculationDuration: duration,
        dataFreshness: 'Calculado em tempo real'
      }
    }
    
    console.log(`✅ [CONTROLLER] Benchmarks calculados em ${duration}ms para ${allClassesAnalytics.length} turmas`)
    
    res.status(200).json({
      success: true,
      data: benchmarkData,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ [CONTROLLER] Erro ao calcular benchmarks:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular benchmarks da indústria',
      error: error.message
    })
  }
}

// ✅ NOVO: Endpoint para analytics multi-plataforma (Fase 5)
export const getMultiPlatformAnalytics = async (req: Request, res: Response) => {
  try {
    const baseQuery = { isDeleted: { $ne: true } }

    // Stats gerais
    const totalUsers = await User.countDocuments(baseQuery)
    const activeUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'combined.status': 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ativo' }
      ]
    })

    // Stats por plataforma
    const hotmartUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null, $ne: '' } },
        { hotmartUserId: { $exists: true, $ne: null, $ne: '' } }
      ]
    })

    const curseducaUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null, $ne: '' } },
        { curseducaUserId: { $exists: true, $ne: null, $ne: '' } }
      ]
    })

    const discordUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } }
      ]
    })

    // Multi-plataforma
    const allUsers = await User.find(baseQuery)
      .select('hotmart curseduca discord hotmartUserId curseducaUserId discordIds')
      .lean()

    let multiPlatformUsers = 0
    allUsers.forEach(user => {
      const platforms = [
        !!(user.hotmart?.hotmartUserId || user.hotmartUserId),
        !!(user.curseduca?.curseducaUserId || user.curseducaUserId),
        !!(user.discord?.discordIds?.length || user.discordIds?.length)
      ].filter(Boolean).length

      if (platforms >= 2) multiPlatformUsers++
    })

    // Engagement por plataforma - importar função do serviço
    const { getEngagementStatsByPlatform } = require('../services/engagementService')
    const engagementStats = await getEngagementStatsByPlatform()

    res.json({
      success: true,
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      platformStats: {
        hotmartUsers,
        curseducaUsers,
        discordUsers,
        multiPlatformUsers
      },
      engagement: engagementStats,
      insights: {
        platformDiversity: multiPlatformUsers > 0 
          ? `${((multiPlatformUsers / totalUsers) * 100).toFixed(1)}% dos utilizadores estão em múltiplas plataformas`
          : 'Nenhum utilizador em múltiplas plataformas',
        mostPopular: hotmartUsers > curseducaUsers && hotmartUsers > discordUsers
          ? 'Hotmart'
          : curseducaUsers > discordUsers
          ? 'Curseduca'
          : 'Discord',
        bestEngagement: engagementStats.hotmart.avg > engagementStats.curseduca.avg
          ? 'Hotmart tem melhor engagement'
          : 'Curseduca tem melhor engagement'
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar analytics multi-plataforma:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar analytics',
      error: error.message
    })
  }
}

// ✅ EXPORTAR TODOS OS CONTROLADORES
export const analyticsController = {
  getClassAnalytics,
  recalculateClassScores,
  getOutdatedClasses,
  recalculateIndividualScores,
  getHealthScore,
  getEngagementDistribution,
  getClassAlerts,
  getQuickStats,
  getGlobalAnalytics,             // ← NOVO
  compareClasses,                 // ← NOVO
  getOpportunities,               // ← NOVO
  getBenchmarks,                  // ← NOVO
  getMultiPlatformAnalytics       // ✅ NOVO - Fase 5
}