import { type NextFunction, Request, Response } from 'express'
import User from '../../models/user'
import { forwardEngagementError } from './support'

export const getEngagementStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    forwardEngagementError(next, error, 'Erro ao calcular estatísticas', 'ENGAGEMENT_STATS_READ_FAILED')
  }
}

/**
 * ✅ ENDPOINT: Get Engagement Details
 * Busca detalhes de engagement com filtros e paginação
 */
