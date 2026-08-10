import { Request, Response } from 'express'
import { FilterQuery, PipelineStage } from 'mongoose'
import User, { IUser } from '../../models/user'
import { type EngagementLevel, type EngagementSummaryUser, type EngagementLevelStat, errorMessage, isEngagementLevel } from './support'

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
