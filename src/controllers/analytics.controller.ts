// src/controllers/analytics.controller.ts - VERSÃO COMPLETA FINAL MELHORADA
import { Request, Response } from 'express'
import User from '../models/user'
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
  getMultiPlatformAnalytics       // ✅ NOVO - Fase 5
}
