// src/controllers/analytics.controller.ts - VERSÃO COMPLETA FINAL MELHORADA
import { Request, Response } from 'express'
import User from '../models/user'
import { Class } from '../models/Class'
import { calculateCombinedEngagement } from '../utils/engagementCalculator'
import { getEngagementStatsByPlatform } from '../services/syncUtilizadoresServices/engagement/engagementService'

interface MultiPlatformUserSources {
  hotmart?: {
    hotmartUserId?: string
  }
  curseduca?: {
    curseducaUserId?: string
  }
  discord?: {
    discordIds?: string[]
  }
  hotmartUserId?: string
  curseducaUserId?: string
  discordIds?: string[]
}

// ================================================================================================
// 🚀 NOVOS ENDPOINTS PARA ADICIONAR AO analytics.controller.ts EXISTENTE
// ================================================================================================

// ✅ 1. ENDPOINT PARA RECALCULAR SCORES INDIVIDUAIS DOS ALUNOS
export const recalculateIndividualScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId } = req.params
    
    console.log(`🔄 [CONTROLLER] Recalculando scores individuais para turma: ${classId}`)

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
        const existingLevel = student.combined?.engagement?.level
          ?? student.hotmart?.engagement?.engagementLevel
          ?? student.curseduca?.engagement?.engagementLevel

        // Calcular novo engagement score
        const engagementResult = calculateCombinedEngagement({
          engagement: existingLevel,
          accessCount: student.hotmart?.engagement?.accessCount,
          progress: {
            completedPercentage: student.combined?.totalProgress ?? 0,
          },
        })
        
        // Atualizar na base de dados
        await User.findByIdAndUpdate(student._id, {
          'combined.combinedEngagement': engagementResult.score,
          'combined.engagement.score': engagementResult.score,
          'combined.engagement.level': engagementResult.level,
          'combined.calculatedAt': new Date(),
          'metadata.updatedAt': new Date(),
        })
        
        updated++
        results.push({
          studentId: student._id,
          name: student.name || student.email,
          oldScore: student.combined?.combinedEngagement || 0,
          newScore: engagementResult.score,
          oldLevel: existingLevel || 'BAIXO',
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

export const getBenchmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`📈 [CONTROLLER] Calculando benchmarks da indústria`)
    
    // Importar modelos
    
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
        { 'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] } },
        { hotmartUserId: { $exists: true, $nin: [null, ''] } }
      ]
    })

    const curseducaUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
        { curseducaUserId: { $exists: true, $nin: [null, ''] } }
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
      .lean<MultiPlatformUserSources[]>()

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
  recalculateIndividualScores,
  getBenchmarks,                  // ← NOVO
  getMultiPlatformAnalytics       // ✅ NOVO - Fase 5
}
