import logger from '../../utils/logger'
import { successResponse } from '../../contracts/responseContract'
import { type NextFunction, Request, Response } from 'express'
import { FilterQuery, PipelineStage } from 'mongoose'
import User, { IUser } from '../../models/user'
import { type EngagementFacetResult, forwardEngagementError } from '../../services/engagement/controllerSupport'

export const getUsersEngagementDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      minScore = 0,
      maxScore = 100,
      search = ''
    } = req.query

    logger.info(`🔍 Buscando utilizadores com score ${minScore}-${maxScore}, página ${page}`)

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

    logger.info(`⚡ Executando agregação otimizada...`)
    const startTime = Date.now()
    
    // ✅ EXECUTAR AGREGAÇÃO
    const [result] = await User.aggregate<EngagementFacetResult>(pipeline).allowDiskUse(true)
    
    const executionTime = Date.now() - startTime
    logger.info(`✅ Agregação completa em ${executionTime}ms`)

    // Extrair resultados
    const totalItems = result?.totalCount?.[0]?.total || 0
    const users = result?.paginatedData || []
    const totalPages = Math.ceil(totalItems / targetLimit)

    logger.info(`📊 Resultado: ${totalItems} utilizadores totais, página ${currentPage}/${totalPages}`)

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
    res.status(200).json(successResponse(
      { users: usersWithClassNames },
      {
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
        },
        timestamp: new Date().toISOString(),
      },
    ))

  } catch (error: unknown) {
    forwardEngagementError(next, error, 'Erro ao buscar detalhes de engagement', 'ENGAGEMENT_USERS_READ_FAILED')
  }
}

// ✅ NOVOS CONTROLADORES: Cache management (BONUS - para debug/admin)
