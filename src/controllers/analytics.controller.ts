// src/controllers/analytics.controller.ts - VERSÃO COMPLETA FINAL MELHORADA
import { Request, Response } from 'express'
import User from '../models/user'
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
  getMultiPlatformAnalytics       // ✅ NOVO - Fase 5
}
