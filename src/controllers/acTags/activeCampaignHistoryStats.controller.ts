import type { RequestHandler } from 'express'
import { internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'

import CommunicationHistory from '../../models/acTags/CommunicationHistory'
import logger from '../../utils/logger'

function queryString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * GET /api/activecampaign/history/stats
 * Retorna estatísticas agregadas do histórico
 */
export const getHistoryStats: RequestHandler = async (req, res, next) => {
  try {
    logger.info('📊 Calculando estatísticas do histórico...')

    const { days = '30' } = req.query
    const daysNum = parseInt(queryString(days, '30'))

    const since = new Date()
    since.setDate(since.getDate() - daysNum)

    logger.info(`📅 Desde: ${since.toISOString()} (${daysNum} dias)`)

    // ═══════════════════════════════════════════════════════════
    // AGREGAÇÕES
    // ═══════════════════════════════════════════════════════════
    const stats = await CommunicationHistory.aggregate([
      {
        $match: {
          timestamp: { $gte: since }
        }
      },
      {
        $facet: {
          // Por tipo de ação
          byAction: [
            {
              $group: {
                _id: '$action',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],

          // Por fonte
          bySource: [
            {
              $group: {
                _id: '$source',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],

          // Por dia
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 },
                tagsAdded: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_ADDED'] }, 1, 0]
                  }
                },
                tagsRemoved: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_REMOVED'] }, 1, 0]
                  }
                }
              }
            },
            { $sort: { _id: 1 } }
          ],

          // Top 10 tags mais usadas
          topTags: [
            {
              $group: {
                _id: '$tagName',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],

          // Top 10 regras mais executadas
          topRules: [
            {
              $match: { tagRuleId: { $exists: true } }
            },
            {
              $lookup: {
                from: 'tagrules',
                localField: 'tagRuleId',
                foreignField: '_id',
                as: 'rule'
              }
            },
            { $unwind: '$rule' },
            {
              $group: {
                _id: '$tagRuleId',
                ruleName: { $first: '$rule.name' },
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],

          // Total geral
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                tagsAdded: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_ADDED'] }, 1, 0]
                  }
                },
                tagsRemoved: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'TAG_REMOVED'] }, 1, 0]
                  }
                },
                emailsSent: {
                  $sum: {
                    $cond: [{ $eq: ['$action', 'EMAIL_SENT'] }, 1, 0]
                  }
                },
                uniqueUsers: { $addToSet: '$userId' }
              }
            },
            {
              $project: {
                _id: 0,
                total: 1,
                tagsAdded: 1,
                tagsRemoved: 1,
                emailsSent: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
              }
            }
          ]
        }
      }
    ])

    const result = stats[0]

    logger.info(`✅ Estatísticas calculadas:`)
    logger.info(`   Total de ações: ${result.totals[0]?.total || 0}`)
    logger.info(`   Tags aplicadas: ${result.totals[0]?.tagsAdded || 0}`)
    logger.info(`   Tags removidas: ${result.totals[0]?.tagsRemoved || 0}`)

    // ═══════════════════════════════════════════════════════════
    // RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json(successResponse(
      {
        totals: result.totals[0] || {
          total: 0,
          tagsAdded: 0,
          tagsRemoved: 0,
          emailsSent: 0,
          uniqueUsers: 0
        },
        byAction: result.byAction,
        bySource: result.bySource,
        byDay: result.byDay,
        topTags: result.topTags,
        topRules: result.topRules
      },
      {
        period: {
          days: daysNum,
          since: since.toISOString(),
          until: new Date().toISOString()
        }
      }
    ))
    return
  } catch (error: unknown) {
    next(internalError('Erro ao calcular estatísticas', 'AC_HISTORY_STATS_FAILED', error))
    return
  }
}
