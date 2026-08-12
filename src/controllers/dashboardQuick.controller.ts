import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import UserProduct from '../models/UserProduct'
import mongoose from 'mongoose'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'

interface ProductComparisonAggregate {
  _id: mongoose.Types.ObjectId
  totalStudentsCount?: number
  productName?: string
  platform?: string
  avgEngagement?: number
  alto?: number
  medio?: number
  baixo?: number
  risco?: number
}

interface ProductBreakdownAggregate {
  _id: mongoose.Types.ObjectId
  totalStudentsCount?: number
  productName?: string
  platform?: string
  avgEngagement?: number
  avgProgress?: number
  activeStudents?: number
}

interface ProductMatchStage {
  isPrimary: { $ne: false }
  platform?: { $in: string[] }
}

/**
 * GET /api/dashboard/quick/product-comparison
 * Comparação rápida de produtos usando agregação MongoDB
 */
export const getProductComparison = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('\n📊 [Quick Comparison] Agregando dados por produto...')

    const products = await UserProduct.aggregate<ProductComparisonAggregate>([
      { $match: { isPrimary: { $ne: false } } },
      {
        $group: {
          _id: '$productId',
          totalStudents: { $addToSet: '$userId' },
          avgEngagement: { $avg: '$engagement.engagementScore' },
          platform: { $first: '$platform' },
          alto: {
            $sum: {
              $cond: [{ $gte: ['$engagement.engagementScore', 60] }, 1, 0]
            }
          },
          medio: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$engagement.engagementScore', 40] },
                    { $lt: ['$engagement.engagementScore', 60] }
                  ]
                },
                1,
                0
              ]
            }
          },
          baixo: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$engagement.engagementScore', 25] },
                    { $lt: ['$engagement.engagementScore', 40] }
                  ]
                },
                1,
                0
              ]
            }
          },
          risco: {
            $sum: {
              $cond: [{ $lt: ['$engagement.engagementScore', 25] }, 1, 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $addFields: {
          totalStudentsCount: { $size: '$totalStudents' },
          productName: { $arrayElemAt: ['$productInfo.name', 0] }
        }
      },
      { $sort: { totalStudentsCount: -1 } },
      { $limit: 10 }
    ], { allowDiskUse: true })

    logger.info(`✅ [Quick Comparison] ${products.length} produtos encontrados`)

    const comparison = products.map((product) => {
      const totalStudents = product.totalStudentsCount || 0

      return {
        productId: product._id.toString(),
        productName: product.productName || 'Produto Desconhecido',
        platform: product.platform || 'unknown',
        totalStudents,
        avgScore: Math.round(product.avgEngagement || 0),
        trend: 0,
        distribution: {
          alto: {
            count: product.alto || 0,
            percentage: totalStudents > 0 ? Math.round(((product.alto || 0) / totalStudents) * 100) : 0
          },
          medio: {
            count: product.medio || 0,
            percentage: totalStudents > 0 ? Math.round(((product.medio || 0) / totalStudents) * 100) : 0
          },
          baixo: {
            count: product.baixo || 0,
            percentage: totalStudents > 0 ? Math.round(((product.baixo || 0) / totalStudents) * 100) : 0
          },
          risco: {
            count: product.risco || 0,
            percentage: totalStudents > 0 ? Math.round(((product.risco || 0) / totalStudents) * 100) : 0
          }
        }
      }
    })

    return res.status(200).json(successResponse(comparison, {
      calculatedAt: new Date(),
      cached: false,
      method: 'mongodb-aggregation'
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar comparação de produtos', 'DASHBOARD_QUICK_COMPARISON_FAILED', error))
  }
}

/**
 * GET /api/dashboard/quick/engagement-heatmap
 * Heatmap temporal simplificado (mock data por agora)
 */
export const getEngagementHeatmap = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('\n🔥 [Quick Heatmap] Gerando heatmap simplificado...')

    const mockWeeks = []
    const today = new Date()

    for (let weekNum = 1; weekNum <= 4; weekNum++) {
      const days = []
      for (let dayNum = 0; dayNum < 7; dayNum++) {
        const date = new Date(today)
        date.setDate(date.getDate() - ((4 - weekNum) * 7 + (6 - dayNum)))

        const isWeekend = dayNum >= 5
        const baseScore = isWeekend ? 28 : 38
        const variance = Math.floor(Math.random() * 10) - 5
        const avgScore = Math.max(15, Math.min(50, baseScore + variance))

        const level = avgScore >= 40 ? 'alto' :
          avgScore >= 30 ? 'medio' :
            avgScore >= 20 ? 'baixo' : 'risco'

        days.push({
          day: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayNum],
          date: date.toISOString().split('T')[0],
          avgScore,
          level,
          activeUsers: Math.floor(Math.random() * 100) + 50
        })
      }

      mockWeeks.push({
        weekNumber: weekNum,
        startDate: days[0].date,
        days
      })
    }

    const heatmapData = {
      weeks: mockWeeks,
      insights: {
        bestDay: 'Quarta-feira',
        worstDay: 'Domingo',
        weekendDrop: 25
      }
    }

    logger.info('✅ [Quick Heatmap] Heatmap gerado')

    return res.status(200).json(successResponse(heatmapData, {
      isMock: true,
      message: 'Dados simulados - implementar tracking temporal'
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao gerar heatmap', 'DASHBOARD_QUICK_HEATMAP_FAILED', error))
  }
}

/**
 * GET /api/dashboard/quick/products-breakdown
 * Breakdown rápido por produto usando agregação MongoDB
 */
export const getProductsBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('\n📦 [Quick Products] Agregando breakdown por produto...')

    const { platforms } = req.query
    const matchStage: ProductMatchStage = { isPrimary: { $ne: false } }

    if (platforms && typeof platforms === 'string') {
      const platformList = platforms.split(',').map((p: string) => p.toLowerCase())
      matchStage.platform = { $in: platformList }
    }

    const products = await UserProduct.aggregate<ProductBreakdownAggregate>([
      { $match: matchStage },
      {
        $group: {
          _id: '$productId',
          totalStudents: { $addToSet: '$userId' },
          avgEngagement: { $avg: '$engagement.engagementScore' },
          avgProgress: { $avg: '$progress.percentage' },
          platform: { $first: '$platform' },
          activeStudents: {
            $sum: {
              $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $addFields: {
          totalStudentsCount: { $size: '$totalStudents' },
          productName: { $arrayElemAt: ['$productInfo.name', 0] }
        }
      },
      { $sort: { totalStudentsCount: -1 } }
    ], { allowDiskUse: true })

    const breakdown = products.map((product) => ({
      productId: product._id.toString(),
      productName: product.productName || 'Produto Desconhecido',
      platform: product.platform || 'unknown',
      totalStudents: product.totalStudentsCount || 0,
      avgEngagement: Math.round(product.avgEngagement || 0),
      avgProgress: Math.round(product.avgProgress || 0),
      engagementRate: (product.totalStudentsCount || 0) > 0
        ? Math.round(((product.activeStudents || 0) / (product.totalStudentsCount || 1)) * 100)
        : 0
    }))

    logger.info(`✅ [Quick Products] ${breakdown.length} produtos`)

    return res.status(200).json(successResponse(breakdown, {
      calculatedAt: new Date(),
      cached: false,
      method: 'mongodb-aggregation'
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar breakdown de produtos', 'DASHBOARD_QUICK_BREAKDOWN_FAILED', error))
  }
}
