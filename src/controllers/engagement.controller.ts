// =====================================================
// 📁 BO/src/controllers/engagement.controller.ts
// VERSÃO HÍBRIDA - Mantém funcionalidades existentes + adiciona cache otimizado
// =====================================================

import { Request, Response } from 'express'
import { FilterQuery, PipelineStage } from 'mongoose'
import User, { IUser } from '../models/user'

// ✅ CACHE OTIMIZADO (NOVO) - apenas adiciona cache às funções existentes
class EngagementStatsCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>()
  private readonly TTL = 300000 // 5 minutos (increased since aggregation is fast)

  get(key: string): { data: T; timestamp: number } | null {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }

    return item
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  clear(): void {
    this.cache.clear()
  }

  getSize(): number {
    return this.cache.size
  }
}

// ✅ INTERFACE PARA ESTATÍSTICAS DE ENGAGEMENT (MANTIDA)
interface EngagementStats {
  totalUsers: number
  averageScore: number
  distribution: {
    MUITO_BAIXO: number
    BAIXO: number
    MEDIO: number
    ALTO: number
    MUITO_ALTO: number
  }
  topPerformersCount: number
  needsAttentionCount: number
  platformStats: {
    hotmartUsers: number
    discordUsers: number
    curseducaUsers: number
    activeUsers: number
    inactiveUsers: number
  }
}

type EngagementLevel = keyof EngagementStats['distribution']

interface EngagementUserDetails {
  _id: unknown
  name?: string
  email?: string
  status?: string
  classId?: string
  engagementScore: number
  engagement: string
  accessCount: number
  progress: {
    completed: number
    total: number
    completedPercentage: number
  }
  groupName?: string | null
  hotmartUserId?: string | null
  curseducaUserId?: string | null
  lastAccessDate?: Date | string | null
  discordIds?: string[]
  discordUsername?: string | null
}

interface EngagementFacetResult {
  totalCount: Array<{ total: number }>
  paginatedData: EngagementUserDetails[]
}

interface EngagementSummaryUser {
  engagementScore: number
}

interface EngagementLevelStat {
  _id: unknown
  count: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isEngagementLevel(value: unknown): value is EngagementLevel {
  return typeof value === 'string'
    && ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'].includes(value)
}

const statsCache = new EngagementStatsCache<EngagementStats>()

// ✅ CONTROLADOR PRINCIPAL - ESTATÍSTICAS GLOBAIS (MANTIDO - com cache adicionado)
export const getGlobalEngagementStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const cacheKey = 'global-engagement-stats'
    const startTime = Date.now()

    // ✅ Verificar cache primeiro (cache por 5 minutos)
    const cachedEntry = statsCache.get(cacheKey)
    if (cachedEntry) {
      console.log('📦 Returning cached global engagement stats')
      
      res.status(200).json({
        success: true,
        data: {
          ...cachedEntry.data,
          cached: true,
          cacheAge: Date.now() - cachedEntry.timestamp
        },
        processingTime: Date.now() - startTime
      })
      return
    }

    // ✅ USAR AGREGAÇÃO MONGODB OTIMIZADA - USAR SCORES JÁ CALCULADOS
    console.log('🚀 Calculando estatísticas com MongoDB aggregation...')
    
    const aggregationResult = await User.aggregate([
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
    ]).allowDiskUse(true)

    if (!aggregationResult || aggregationResult.length === 0) {
      const emptyStats: EngagementStats = {
        totalUsers: 0,
        averageScore: 0,
        distribution: { MUITO_BAIXO: 0, BAIXO: 0, MEDIO: 0, ALTO: 0, MUITO_ALTO: 0 },
        topPerformersCount: 0,
        needsAttentionCount: 0,
        platformStats: { hotmartUsers: 0, discordUsers: 0, curseducaUsers: 0, activeUsers: 0, inactiveUsers: 0 }
      }
      
      res.status(200).json({
        success: true,
        data: emptyStats,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime
      })
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

    console.log('📈 Estatísticas OTIMIZADAS calculadas em:', Date.now() - startTime, 'ms')
    console.log('📊 Resultados:', {
      totalUsers: stats.totalUsers,
      averageScore: stats.averageScore,
      topPerformers: stats.topPerformersCount,
      needsAttention: stats.needsAttentionCount
    })

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        cached: false,
        cacheAge: 0
      },
      timestamp: new Date().toISOString(),
      processingMethod: 'mongodb-aggregation',
      processingTime: Date.now() - startTime
    })

  } catch (error: unknown) {
    console.error('❌ Erro ao calcular estatísticas de engagement:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas de engagement',
      details: errorMessage(error)
    })
  }
}

// ✅ CONTROLADOR PARA DETALHES DE UTILIZADORES - VERSÃO OTIMIZADA COM AGREGAÇÃO
// 🚀 Esta versão usa MongoDB Aggregation Pipeline para máxima performance e escalabilidade
export const getUsersEngagementDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      minScore = 0,
      maxScore = 100,
      search = ''
    } = req.query

    console.log(`🔍 Buscando utilizadores com score ${minScore}-${maxScore}, página ${page}`)

    // ✅ QUERY BASE PARA FILTRAR UTILIZADORES
    const matchQuery: FilterQuery<IUser> = {}
    
    if (search && typeof search === 'string') {
      matchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    const targetLimit = +limit
    const currentPage = +page

    // ✅ NOVA ESTRATÉGIA: USAR AGREGAÇÃO MONGODB PARA PERFORMANCE OTIMIZADA
    // Esta abordagem é muito mais eficiente e escala para qualquer número de utilizadores
    
    const pipeline: PipelineStage[] = [
      // Etapa 1: Match inicial
      { $match: matchQuery },
      
      // Etapa 2: Projetar apenas os campos necessários
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          status: 1,
          classId: 1,
          
          // Calcular score com prioridade
          engagementScore: {
            $ifNull: [
              '$combined.engagement.score',
              { $ifNull: [
                '$combined.combinedEngagement',
                { $ifNull: [
                  '$hotmart.engagement.engagementScore',
                  { $ifNull: [
                    '$curseduca.engagement.alternativeEngagement',
                    0
                  ]}
                ]}
              ]}
            ]
          },
          
          // Nível de engagement
          engagement: {
            $ifNull: [
              '$combined.engagement.level',
              { $ifNull: [
                '$hotmart.engagement.engagementLevel',
                { $ifNull: [
                  '$curseduca.engagement.engagementLevel',
                  'NONE'
                ]}
              ]}
            ]
          },
          
          // Access count
          accessCount: { $ifNull: ['$hotmart.engagement.accessCount', 0] },
          
          // Progresso Hotmart
          hotmartCompleted: { $ifNull: ['$hotmart.progress.completedLessons', 0] },
          hotmartTotal: { 
            $size: { 
              $ifNull: ['$hotmart.progress.lessonsData', []] 
            } 
          },
          
          // Progresso CursEduca
          curseducaProgress: { $ifNull: ['$curseduca.progress.completedPercentage', 0] },
          curseducaEstimatedProgress: { $ifNull: ['$curseduca.progress.estimatedProgress', 0] },
          
          // Grupo CursEduca
          curseducaGroupName: { $ifNull: ['$curseduca.groupName', null] },
          
          // IDs de plataforma
          hotmartUserId: {
            $ifNull: [
              '$hotmart.hotmartUserId',
              { $ifNull: ['$hotmartUserId', null] }
            ]
          },
          curseducaUserId: {
            $ifNull: [
              '$curseduca.curseducaUserId',
              { $ifNull: ['$curseducaUserId', null] }
            ]
          },
          
          // Last access date
          lastAccessDate: {
            $ifNull: [
              '$hotmart.progress.lastAccessDate',
              { $ifNull: [
                '$hotmart.lastAccessDate',
                { $ifNull: [
                  '$curseduca.lastAccessDate',
                  { $ifNull: ['$lastAccessDate', null] }
                ]}
              ]}
            ]
          },
          
          // Discord
          discordIds: { $ifNull: ['$discord.discordIds', '$discordIds'] },
          discordUsername: { $ifNull: ['$discord.username', null] }
        }
      },
      
      // Etapa 3: Filtrar por score range
      {
        $match: {
          engagementScore: {
            $gte: +minScore,
            $lte: +maxScore
          }
        }
      },
      
      // Etapa 4: Adicionar campos calculados
      {
        $addFields: {
          progress: {
            completed: '$hotmartCompleted',
            total: '$hotmartTotal',
            completedPercentage: {
              $cond: [
                { $gt: ['$hotmartTotal', 0] },
                { $round: [
                  { $multiply: [
                    { $divide: ['$hotmartCompleted', '$hotmartTotal'] },
                    100
                  ]}
                ]},
                { $ifNull: [
                  '$curseducaProgress',
                  { $ifNull: ['$curseducaEstimatedProgress', 0] }
                ]}
              ]
            }
          },
          // Adicionar groupName se existir
          groupName: '$curseducaGroupName'
        }
      },
      
      // Etapa 5: Ordenar por score (descendente)
      { $sort: { engagementScore: -1 } },
      
      // Etapa 6: Facet para contar total E paginar
      {
        $facet: {
          // Contar total de documentos que correspondem aos filtros
          totalCount: [
            { $count: 'total' }
          ],
          // Obter dados paginados
          paginatedData: [
            { $skip: (currentPage - 1) * targetLimit },
            { $limit: targetLimit }
          ]
        }
      }
    ]

    console.log(`⚡ Executando agregação otimizada...`)
    const startTime = Date.now()
    
    // ✅ EXECUTAR AGREGAÇÃO
    const [result] = await User.aggregate<EngagementFacetResult>(pipeline).allowDiskUse(true)
    
    const executionTime = Date.now() - startTime
    console.log(`✅ Agregação completa em ${executionTime}ms`)

    // Extrair resultados
    const totalItems = result?.totalCount?.[0]?.total || 0
    const users = result?.paginatedData || []
    const totalPages = Math.ceil(totalItems / targetLimit)

    console.log(`📊 Resultado: ${totalItems} utilizadores totais, página ${currentPage}/${totalPages}`)

    // ✅ BUSCAR NOMES DAS TURMAS (se necessário)
    const usersWithClassNames = await Promise.all(
      users.map(async (user) => {
        if (user.classId) {
          try {
            // Cache de turmas para evitar múltiplas queries
            const classInfo = await User.db.collection('classes').findOne(
              { classId: user.classId },
              { projection: { name: 1 } }
            )
            return {
              ...user,
              className: classInfo?.name || user.classId
            }
          } catch {
            return user
          }
        }
        return user
      })
    )

    // ✅ RESPOSTA OTIMIZADA
    res.status(200).json({
      success: true,
      data: {
        users: usersWithClassNames,
        pagination: {
          currentPage: currentPage,
          totalPages: totalPages,
          totalItems: totalItems,
          itemsPerPage: targetLimit,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1,
          isComplete: true // ✅ Sempre completo, pois conta todos
        },
        // ✅ INFO DE PERFORMANCE
        performance: {
          executionTimeMs: executionTime,
          method: 'mongodb-aggregation',
          totalProcessed: totalItems,
          scoreRange: `${minScore}-${maxScore}`,
          search: search || null
        }
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    console.error('❌ Erro ao buscar detalhes de engagement:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes de engagement',
      details: errorMessage(error)
    })
  }
}

// ✅ NOVOS CONTROLADORES: Cache management (BONUS - para debug/admin)
export const clearEngagementCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const sizeBefore = statsCache.getSize()
    statsCache.clear()
    
    console.log(`🧹 Engagement cache cleared (was ${sizeBefore} items)`)
    
    res.status(200).json({
      success: true,
      message: 'Cache de engagement limpo com sucesso',
      clearedItems: sizeBefore
    })
  } catch (error: unknown) {
    console.error('❌ Error clearing engagement cache:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar cache',
      details: errorMessage(error)
    })
  }
}

export const getEngagementStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 GET /api/engagement/stats - Calculando estatísticas...')
    
    // Agregação para calcular estatísticas
    const stats = await User.aggregate([
      {
        $match: {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalScore: { 
            $sum: { 
              $ifNull: ['$preComputed.engagementScore', 0] 
            } 
          },
          activeUsers: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$status', 'ACTIVE'] },
                  { $eq: ['$estado', 'ativo'] }
                ]},
                1,
                0
              ]
            }
          },
          muitoAlto: {
            $sum: {
              $cond: [
                { $eq: ['$preComputed.activityLevel', 'MUITO_ALTO'] },
                1,
                0
              ]
            }
          },
          alto: {
            $sum: {
              $cond: [
                { $eq: ['$preComputed.activityLevel', 'ALTO'] },
                1,
                0
              ]
            }
          },
          medio: {
            $sum: {
              $cond: [
                { $eq: ['$preComputed.activityLevel', 'MEDIO'] },
                1,
                0
              ]
            }
          },
          baixo: {
            $sum: {
              $cond: [
                { $eq: ['$preComputed.activityLevel', 'BAIXO'] },
                1,
                0
              ]
            }
          },
          muitoBaixo: {
            $sum: {
              $cond: [
                { $eq: ['$preComputed.activityLevel', 'MUITO_BAIXO'] },
                1,
                0
              ]
            }
          }
        }
      }
    ])

    const result = stats[0] || {
      totalUsers: 0,
      totalScore: 0,
      activeUsers: 0,
      muitoAlto: 0,
      alto: 0,
      medio: 0,
      baixo: 0,
      muitoBaixo: 0
    }

    // Calcular média
    const averageScore = result.totalUsers > 0 
      ? Math.round(result.totalScore / result.totalUsers) 
      : 0

    // ✅ CALCULAR USERS POR PLATAFORMA CORRETAMENTE
    const baseQuery = { isDeleted: { $ne: true } }
    
    // Contar users do Hotmart
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
        {
          $and: [
            { curseducaUserId: { $exists: true } },
            { curseducaUserId: { $ne: null } },
            { curseducaUserId: { $ne: "" } }
          ]
        },
        {
          $and: [
            { 'curseduca.curseducaUserId': { $exists: true } },
            { 'curseduca.curseducaUserId': { $ne: null } },
            { 'curseduca.curseducaUserId': { $ne: "" } }
          ]
        }
      ]
    })

    // Contar users do Discord
    const discordUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } }
      ]
    })

    console.log('📊 Platform Stats calculadas:', {
      hotmart: hotmartUsers,
      curseduca: curseducaUsers,  // ✅ Deve mostrar 4!
      discord: discordUsers
    })

    // ✅ RESPONSE DATA COM VALORES CORRETOS
    const responseData = {
      totalUsers: result.totalUsers,
      activeUsers: result.activeUsers,
      averageScore,
      distribution: {
        MUITO_ALTO: result.muitoAlto,
        ALTO: result.alto,
        MEDIO: result.medio,
        BAIXO: result.baixo,
        MUITO_BAIXO: result.muitoBaixo
      },
      platformStats: {
        hotmartUsers,      // ✅ Valor real da BD
        discordUsers,      // ✅ Valor real da BD
        curseducaUsers,    // ✅ CORRIGIDO - Agora usa a variável calculada!
        activeUsers: result.activeUsers
      }
    }

    console.log('✅ Stats calculadas com sucesso:', {
      total: responseData.totalUsers,
      average: responseData.averageScore,
      platforms: {
        hotmart: responseData.platformStats.hotmartUsers,
        curseduca: responseData.platformStats.curseducaUsers,  // ✅ Verificar este valor
        discord: responseData.platformStats.discordUsers
      }
    })

    res.status(200).json({
      success: true,
      stats: responseData,
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    console.error('❌ Erro getEngagementStats:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas',
      error: errorMessage(error)
    })
  }
}

/**
 * ✅ ENDPOINT: Get Engagement Details
 * Busca detalhes de engagement com filtros e paginação
 */
export const getEngagementDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 GET /api/engagement/details - Buscando detalhes de engagement...')
    
    // Parâmetros da query
    const minScore = parseInt(req.query.minScore as string) || 0
    const maxScore = parseInt(req.query.maxScore as string) || 100
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const level = req.query.level as string // MUITO_ALTO, ALTO, MEDIO, BAIXO, MUITO_BAIXO
    
    const skip = (page - 1) * limit
    
    console.log(`🔍 Filtros: score ${minScore}-${maxScore}, level: ${level || 'all'}, page: ${page}`)
    
    // Construir query
    const matchConditions: FilterQuery<IUser>[] = [{
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false }
      ]
    }]
    
    // Filtro por score
    if (minScore > 0 || maxScore < 100) {
      matchConditions.push({
        'preComputed.engagementScore': {
          $gte: minScore,
          $lte: maxScore
        }
      })
    }
    
    // Filtro por nível
    if (level && level !== 'all') {
      matchConditions.push({
        'preComputed.activityLevel': level
      })
    }

    const matchQuery: FilterQuery<IUser> = { $and: matchConditions }
    
    // Pipeline de agregação
    const pipeline : PipelineStage[] = [
      { $match: matchQuery },
      
      // Adicionar campos calculados
      {
        $addFields: {
          engagementScore: {
            $ifNull: ['$preComputed.engagementScore', 0]
          },
          activityLevel: {
            $ifNull: ['$preComputed.activityLevel', 'MUITO_BAIXO']
          }
        }
      },
      
      // Lookup para buscar nome da classe
      {
        $lookup: {
          from: 'classes',
          localField: 'classId',
          foreignField: '_id',
          as: 'classInfo'
        }
      },
      
      // Adicionar className
      {
        $addFields: {
          className: {
            $ifNull: [
              { $arrayElemAt: ['$classInfo.name', 0] },
              '$className',
              'Sem turma'
            ]
          }
        }
      },
      
      // Remover classInfo
      { $unset: 'classInfo' },
      
      // Ordenar por engagement score (maior primeiro)
      { $sort: { engagementScore: -1, _id: 1 } },
      
      // Paginação
      { $skip: skip },
      { $limit: limit },
      
      // Projeção final
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          username: 1,
          engagementScore: 1,
          activityLevel: 1,
          className: 1,
          status: 1,
          estado: 1,
          lastAccessDate: 1,
          accessCount: 1,
          progress: 1,
          discordIds: 1,
          hotmartUserId: 1,
          curseducaUserId: 1
        }
      }
    ]
    
    // Executar agregação
    const users = await User.aggregate<EngagementSummaryUser>(pipeline).allowDiskUse(true)
    
    // Pipeline para contar total
    const countPipeline: PipelineStage[] = [
      { $match: matchQuery },
      { $count: 'total' }
    ]
    
    const countResult = await User.aggregate(countPipeline)
    const totalCount = countResult[0]?.total || 0
    
    // Calcular estatísticas por nível
    const levelStats = await User.aggregate<EngagementLevelStat>([
      { $match: matchQuery },
      {
        $group: {
          _id: '$preComputed.activityLevel',
          count: { $sum: 1 },
          avgScore: { $avg: '$preComputed.engagementScore' }
        }
      }
    ])
    
    // Organizar estatísticas
    const distribution: Record<EngagementLevel, number> = {
      MUITO_ALTO: 0,
      ALTO: 0,
      MEDIO: 0,
      BAIXO: 0,
      MUITO_BAIXO: 0
    }
    
    levelStats.forEach(stat => {
      if (isEngagementLevel(stat._id)) {
        distribution[stat._id] = stat.count
      }
    })
    
    console.log(`✅ Retornando ${users.length} de ${totalCount} utilizadores`)
    
    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1
        },
        filters: {
          minScore,
          maxScore,
          level: level || 'all'
        },
        distribution,
        stats: {
          totalInRange: totalCount,
          averageScore: users.reduce((acc, u) => acc + u.engagementScore, 0) / (users.length || 1)
        }
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error: unknown) {
    console.error('❌ Erro getEngagementDetails:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes de engagement',
      error: errorMessage(error)
    })
  }
}
