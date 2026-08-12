import logger from '../../utils/logger'
import { successResponse } from '../../contracts/responseContract'
import { type NextFunction, Request, Response } from 'express'
import User from '../../models/user'
import { type EngagementStats, forwardEngagementError, statsCache } from '../../services/engagement/controllerSupport'

export const getGlobalEngagementStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cacheKey = 'global-engagement-stats'
    const startTime = Date.now()

    // ✅ Verificar cache primeiro (cache por 5 minutos)
    const cachedEntry = statsCache.get(cacheKey)
    if (cachedEntry) {
      logger.info('📦 Returning cached global engagement stats')
      
      res.status(200).json(successResponse(
        cachedEntry.data,
        {
          cached: true,
          cacheAge: Date.now() - cachedEntry.timestamp,
          processingTime: Date.now() - startTime,
        },
      ))
      return
    }

    // ✅ USAR AGREGAÇÃO MONGODB OTIMIZADA - USAR SCORES JÁ CALCULADOS
    logger.info('🚀 Calculando estatísticas com MongoDB aggregation...')
    
    const aggregationResult = await statsCache.runSingleflight(cacheKey, async () => User.aggregate([
      {
        $project: {
          // ✅ USAR SCORE JÁ CALCULADO (prioridade: combined > hotmart > curseduca)
          engagementScore: {
            $ifNull: [
              "$combined.engagement.score",  // ✅ Tentar combined primeiro
              {
                $ifNull: [
                  "$combined.combinedEngagement",  // ✅ Alternativa
                  {
                    $ifNull: [
                      "$hotmart.engagement.engagementScore",  // ✅ Fallback Hotmart
                      {
                        $ifNull: [
                          "$curseduca.engagement.alternativeEngagement",  // ✅ Fallback Curseduca
                          0  // Default
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          // ✅ FLAGS DE PLATAFORMA (usando campos específicos, não classId!)
          hasHotmart: {
            $or: [
              { $gt: [{ $strLenCP: { $ifNull: ["$hotmart.hotmartUserId", ""] } }, 0] },
              { $gt: [{ $strLenCP: { $ifNull: ["$hotmartUserId", ""] } }, 0] }
            ]
          },
          hasDiscord: {
            $or: [
              { $and: [{ $isArray: "$discord.discordIds" }, { $gt: [{ $size: "$discord.discordIds" }, 0] }] },
              { $and: [{ $isArray: "$discordIds" }, { $gt: [{ $size: "$discordIds" }, 0] }] }
            ]
          },
          hasCurseduca: {
            $or: [
              { 
                $and: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$curseduca.curseducaUserId", ""] } }, 0] }
                ] 
              },
              { 
                $and: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$curseducaUserId", ""] } }, 0] }
                ] 
              }
            ]
          },
          isActive: {
            $or: [
              { $eq: ["$status", "ACTIVE"] },
              { $in: ["$estado", ["ativo", "active"]] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          averageScore: { $avg: "$engagementScore" },
          
          // ✅ Distribuição por nível baseada no score (THRESHOLDS AJUSTADOS 2025-10-12)
          MUITO_BAIXO: { $sum: { $cond: [{ $and: [{ $gte: ["$engagementScore", 0] }, { $lt: ["$engagementScore", 15] }] }, 1, 0] } },
          BAIXO: { $sum: { $cond: [{ $and: [{ $gte: ["$engagementScore", 15] }, { $lt: ["$engagementScore", 30] }] }, 1, 0] } },
          MEDIO: { $sum: { $cond: [{ $and: [{ $gte: ["$engagementScore", 30] }, { $lt: ["$engagementScore", 50] }] }, 1, 0] } },
          ALTO: { $sum: { $cond: [{ $and: [{ $gte: ["$engagementScore", 50] }, { $lt: ["$engagementScore", 70] }] }, 1, 0] } },
          MUITO_ALTO: { $sum: { $cond: [{ $gte: ["$engagementScore", 70] }, 1, 0] } },
          
          // ✅ Top performers e needs attention (THRESHOLDS AJUSTADOS: 50 e 30)
          topPerformersCount: { $sum: { $cond: [{ $gte: ["$engagementScore", 50] }, 1, 0] } },
          needsAttentionCount: { $sum: { $cond: [{ $and: [{ $lt: ["$engagementScore", 30] }, { $gt: ["$engagementScore", 0] }] }, 1, 0] } },
          
          // Estatísticas de plataforma
          hotmartUsers: { $sum: { $cond: ["$hasHotmart", 1, 0] } },
          discordUsers: { $sum: { $cond: ["$hasDiscord", 1, 0] } },
          curseducaUsers: { $sum: { $cond: ["$hasCurseduca", 1, 0] } },
          activeUsers: { $sum: { $cond: ["$isActive", 1, 0] } },
          inactiveUsers: { $sum: { $cond: [{ $not: "$isActive" }, 1, 0] } }
        }
      }
    ]).allowDiskUse(true))

    if (!aggregationResult || aggregationResult.length === 0) {
      const emptyStats: EngagementStats = {
        totalUsers: 0,
        averageScore: 0,
        distribution: { MUITO_BAIXO: 0, BAIXO: 0, MEDIO: 0, ALTO: 0, MUITO_ALTO: 0 },
        topPerformersCount: 0,
        needsAttentionCount: 0,
        platformStats: { hotmartUsers: 0, discordUsers: 0, curseducaUsers: 0, activeUsers: 0, inactiveUsers: 0 }
      }
      
      res.status(200).json(successResponse(
        emptyStats,
        {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
        },
      ))
      return
    }

    const result = aggregationResult[0]
    
    const stats: EngagementStats = {
      totalUsers: result.totalUsers || 0,
      averageScore: Math.round(result.averageScore || 0),
      distribution: {
        MUITO_BAIXO: result.MUITO_BAIXO || 0,
        BAIXO: result.BAIXO || 0,
        MEDIO: result.MEDIO || 0,
        ALTO: result.ALTO || 0,
        MUITO_ALTO: result.MUITO_ALTO || 0
      },
      topPerformersCount: result.topPerformersCount || 0,
      needsAttentionCount: result.needsAttentionCount || 0,
      platformStats: {
        hotmartUsers: result.hotmartUsers || 0,
        discordUsers: result.discordUsers || 0,
        curseducaUsers: result.curseducaUsers || 0,
        activeUsers: result.activeUsers || 0,
        inactiveUsers: result.inactiveUsers || 0
      }
    }

    // ✅ Cachear resultado por 5 minutos
    statsCache.set(cacheKey, stats)

    logger.info('📈 Estatísticas OTIMIZADAS calculadas em:', Date.now() - startTime, 'ms')
    logger.info('📊 Resultados:', {
      totalUsers: stats.totalUsers,
      averageScore: stats.averageScore,
      topPerformers: stats.topPerformersCount,
      needsAttention: stats.needsAttentionCount
    })

    res.status(200).json(successResponse(
      stats,
      {
        cached: false,
        cacheAge: 0,
        timestamp: new Date().toISOString(),
        processingMethod: 'mongodb-aggregation',
        processingTime: Date.now() - startTime,
      },
    ))

  } catch (error: unknown) {
    forwardEngagementError(next, error, 'Erro ao calcular estatísticas de engagement', 'ENGAGEMENT_SUMMARY_READ_FAILED')
  }
}

// ✅ CONTROLADOR PARA DETALHES DE UTILIZADORES - VERSÃO OTIMIZADA COM AGREGAÇÃO
// 🚀 Esta versão usa MongoDB Aggregation Pipeline para máxima performance e escalabilidade

export const clearEngagementCache = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sizeBefore = statsCache.getSize()
    statsCache.clear()
    
    logger.info(`🧹 Engagement cache cleared (was ${sizeBefore} items)`)
    
    res.status(200).json(successResponse(
      { clearedItems: sizeBefore },
      { message: 'Cache de engagement limpo com sucesso' },
    ))
  } catch (error: unknown) {
    forwardEngagementError(next, error, 'Erro ao limpar cache', 'ENGAGEMENT_CACHE_CLEAR_FAILED')
  }
}

