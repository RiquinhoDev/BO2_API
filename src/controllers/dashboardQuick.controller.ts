// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/dashboardQuick.controller.ts
// Endpoints RÁPIDOS para dashboard usando agregação MongoDB
// ══════════════════════════════════════════════════════════════════════

import { NextFunction, Request, Response } from 'express'
import UserProduct from '../models/UserProduct'
import mongoose from 'mongoose'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'

/**
 * GET /api/dashboard/quick/product-comparison
 * Comparação rápida de produtos usando agregação MongoDB
 */
export const getProductComparison = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n📊 [Quick Comparison] Agregando dados por produto...')

    // Agregação MongoDB otimizada
    const products = await UserProduct.aggregate([
      // Match apenas produtos ativos (opcional)
      { $match: { isPrimary: { $ne: false } } }, // Filtra secundários do CursEDuca

      // Group por produto para calcular métricas
      {
        $group: {
          _id: '$productId',
          totalStudents: { $addToSet: '$userId' }, // Users únicos
          avgEngagement: { $avg: '$engagement.engagementScore' },
          platform: { $first: '$platform' },

          // Contar por nível de engagement
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

      // Lookup para obter nome do produto
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },

      // Calcular total de students únicos
      {
        $addFields: {
          totalStudentsCount: { $size: '$totalStudents' },
          productName: { $arrayElemAt: ['$productInfo.name', 0] }
        }
      },

      // Sort por total de estudantes
      { $sort: { totalStudentsCount: -1 } },

      // Limitar a top 10 produtos
      { $limit: 10 }
    ], { allowDiskUse: true })

    console.log(`✅ [Quick Comparison] ${products.length} produtos encontrados`)

    // Transformar para formato esperado pelo frontend
    const comparison = products.map((product: any) => {
      const totalStudents = product.totalStudentsCount || 0

      return {
        productId: product._id.toString(),
        productName: product.productName || 'Produto Desconhecido',
        platform: product.platform || 'unknown',
        totalStudents,
        avgScore: Math.round(product.avgEngagement || 0),
        trend: 0, // TODO: Calcular trend comparando períodos
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
    console.log('\n🔥 [Quick Heatmap] Gerando heatmap simplificado...')

    // Por agora, retornar dados mockados
    // TODO: Implementar sistema de tracking temporal de engagement
    const mockWeeks = []
    const today = new Date()

    for (let weekNum = 1; weekNum <= 4; weekNum++) {
      const days = []
      for (let dayNum = 0; dayNum < 7; dayNum++) {
        const date = new Date(today)
        date.setDate(date.getDate() - ((4 - weekNum) * 7 + (6 - dayNum)))

        // Mock scores baseados em padrões realistas
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

    console.log('✅ [Quick Heatmap] Heatmap gerado')

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
    console.log('\n📦 [Quick Products] Agregando breakdown por produto...')

    const { platforms } = req.query

    // Construir match stage baseado nos filtros
    const matchStage: any = { isPrimary: { $ne: false } }
    if (platforms && typeof platforms === 'string') {
      const platformList = platforms.split(',').map((p: string) => p.toLowerCase())
      matchStage.platform = { $in: platformList }
    }

    // Agregação MongoDB
    const products = await UserProduct.aggregate([
      { $match: matchStage },

      // Group por produto
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

      // Lookup product info
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },

      // Add fields
      {
        $addFields: {
          totalStudentsCount: { $size: '$totalStudents' },
          productName: { $arrayElemAt: ['$productInfo.name', 0] }
        }
      },

      // Sort
      { $sort: { totalStudentsCount: -1 } }
    ], { allowDiskUse: true })

    // Transform
    const breakdown = products.map((product: any) => ({
      productId: product._id.toString(),
      productName: product.productName || 'Produto Desconhecido',
      platform: product.platform || 'unknown',
      totalStudents: product.totalStudentsCount || 0,
      avgEngagement: Math.round(product.avgEngagement || 0),
      avgProgress: Math.round(product.avgProgress || 0),
      engagementRate: product.totalStudentsCount > 0
        ? Math.round((product.activeStudents / product.totalStudentsCount) * 100)
        : 0
    }))

    console.log(`✅ [Quick Products] ${breakdown.length} produtos`)

    return res.status(200).json(successResponse(breakdown, {
        calculatedAt: new Date(),
        cached: false,
        method: 'mongodb-aggregation'
      }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar breakdown de produtos', 'DASHBOARD_QUICK_BREAKDOWN_FAILED', error))
  }
}
