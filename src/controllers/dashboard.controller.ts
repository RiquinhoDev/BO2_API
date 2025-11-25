import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import UserProduct from '../models/UserProduct';

// ═══════════════════════════════════════════════════════
// 📊 ENDPOINT 1: GET /api/dashboard/stats
// Estatísticas gerais para substituir Visão Geral V1
// ═══════════════════════════════════════════════════════
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { platform, productId, status, progressMin, progressMax, search } = req.query;

    // Construir filtro base
    const matchStage: any = {};

    if (platform) {
      matchStage['platforms'] = platform;
    }

    if (productId) {
      matchStage['productId'] = new mongoose.Types.ObjectId(productId as string);
    }

    if (status) {
      matchStage['status'] = status;
    }

    if (progressMin || progressMax) {
      matchStage['progress'] = {};
      if (progressMin) matchStage['progress'].$gte = Number(progressMin);
      if (progressMax) matchStage['progress'].$lte = Number(progressMax);
    }

    // Se houver search, precisamos fazer lookup em User
    let pipeline: any[] = [{ $match: matchStage }];

    if (search) {
      pipeline.unshift(
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $match: {
            $or: [
              { 'user.name': { $regex: search, $options: 'i' } },
              { 'user.email': { $regex: search, $options: 'i' } }
            ]
          }
        }
      );
    }

    // Estatísticas gerais
    const stats = await UserProduct.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          avgEngagement: { $avg: '$engagement.score' },
          avgProgress: { $avg: '$progress' },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          inactiveCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0]
            }
          },
          highEngagement: {
            $sum: {
              $cond: [{ $gte: ['$engagement.score', 70] }, 1, 0]
            }
          },
          lowEngagement: {
            $sum: {
              $cond: [{ $lte: ['$engagement.score', 30] }, 1, 0]
            }
          },
          completedCount: {
            $sum: {
              $cond: [{ $gte: ['$progress', 100] }, 1, 0]
            }
          }
        }
      }
    ]);

    const data = stats[0] || {
      totalStudents: 0,
      avgEngagement: 0,
      avgProgress: 0,
      activeCount: 0,
      inactiveCount: 0,
      highEngagement: 0,
      lowEngagement: 0,
      completedCount: 0
    };

    // Calcular métricas derivadas
    const response = {
      totalStudents: data.totalStudents,
      avgEngagement: Math.round(data.avgEngagement * 100) / 100,
      avgProgress: Math.round(data.avgProgress * 100) / 100,
      activeCount: data.activeCount,
      inactiveCount: data.inactiveCount,
      activeRate: data.totalStudents > 0
        ? Math.round((data.activeCount / data.totalStudents) * 100 * 100) / 100
        : 0,
      highEngagementCount: data.highEngagement,
      lowEngagementCount: data.lowEngagement,
      engagementRate: data.totalStudents > 0
        ? Math.round((data.highEngagement / data.totalStudents) * 100 * 100) / 100
        : 0,
      completedCount: data.completedCount,
      completionRate: data.totalStudents > 0
        ? Math.round((data.completedCount / data.totalStudents) * 100 * 100) / 100
        : 0
    };

    res.json({
      success: true,
      data: response,
      filters: { platform, productId, status, progressMin, progressMax, search }
    });

  } catch (error: any) {
    console.error('❌ Erro em getDashboardStats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════
// 📊 ENDPOINT 2: GET /api/dashboard/products
// Breakdown de alunos por produto
// ═══════════════════════════════════════════════════════
export const getProductsBreakdown = async (req: Request, res: Response) => {
  try {
    const { platform, productId, status, progressMin, progressMax } = req.query;

    // Construir filtro base
    const matchStage: any = {};

    if (platform) {
      matchStage['platforms'] = platform;
    }

    if (productId) {
      matchStage['productId'] = new mongoose.Types.ObjectId(productId as string);
    }

    if (status) {
      matchStage['status'] = status;
    }

    if (progressMin || progressMax) {
      matchStage['progress'] = {};
      if (progressMin) matchStage['progress'].$gte = Number(progressMin);
      if (progressMax) matchStage['progress'].$lte = Number(progressMax);
    }

    // Agregação por produto
    const productsBreakdown = await UserProduct.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$productId',
          totalStudents: { $sum: 1 },
          avgEngagement: { $avg: '$engagement.score' },
          avgProgress: { $avg: '$progress' },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          completedCount: {
            $sum: {
              $cond: [{ $gte: ['$progress', 100] }, 1, 0]
            }
          },
          highEngagement: {
            $sum: {
              $cond: [{ $gte: ['$engagement.score', 70] }, 1, 0]
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
      { $unwind: '$productInfo' },
      {
        $project: {
          productId: '$_id',
          productName: '$productInfo.name',
          productSlug: '$productInfo.slug',
          totalStudents: 1,
          avgEngagement: { $round: ['$avgEngagement', 2] },
          avgProgress: { $round: ['$avgProgress', 2] },
          activeCount: 1,
          activeRate: {
            $round: [
              { $multiply: [{ $divide: ['$activeCount', '$totalStudents'] }, 100] },
              2
            ]
          },
          completedCount: 1,
          completionRate: {
            $round: [
              { $multiply: [{ $divide: ['$completedCount', '$totalStudents'] }, 100] },
              2
            ]
          },
          highEngagementCount: '$highEngagement',
          engagementRate: {
            $round: [
              { $multiply: [{ $divide: ['$highEngagement', '$totalStudents'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { totalStudents: -1 } }
    ]);

    res.json({
      success: true,
      data: productsBreakdown,
      total: productsBreakdown.length,
      filters: { platform, productId, status, progressMin, progressMax }
    });

  } catch (error: any) {
    console.error('❌ Erro em getProductsBreakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════
// 📈 ENDPOINT 3: GET /api/dashboard/engagement
// Distribuição de engagement
// ═══════════════════════════════════════════════════════
export const getEngagementDistribution = async (req: Request, res: Response) => {
  try {
    const { platform, productId } = req.query;

    // Construir filtro
    const matchStage: any = {};

    if (platform) {
      matchStage['platforms'] = platform;
    }

    if (productId) {
      matchStage['productId'] = new mongoose.Types.ObjectId(productId as string);
    }

    // Agregação para distribuição de engagement
    const distribution = await UserProduct.aggregate([
      { $match: matchStage },
      {
        $bucket: {
          groupBy: '$engagement.score',
          boundaries: [0, 20, 40, 60, 80, 100],
          default: 'other',
          output: {
            count: { $sum: 1 },
            students: { $push: '$userId' }
          }
        }
      }
    ]);

    // Estatísticas gerais de engagement
    const stats = await UserProduct.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          avgEngagement: { $avg: '$engagement.score' },
          minEngagement: { $min: '$engagement.score' },
          maxEngagement: { $max: '$engagement.score' },
          totalStudents: { $sum: 1 },
          highEngagement: {
            $sum: {
              $cond: [{ $gte: ['$engagement.score', 70] }, 1, 0]
            }
          },
          mediumEngagement: {
            $sum: {
              $cond: [
                { $and: [
                  { $gte: ['$engagement.score', 40] },
                  { $lt: ['$engagement.score', 70] }
                ]},
                1,
                0
              ]
            }
          },
          lowEngagement: {
            $sum: {
              $cond: [{ $lt: ['$engagement.score', 40] }, 1, 0]
            }
          }
        }
      }
    ]);

    const statsData = stats[0] || {
      avgEngagement: 0,
      minEngagement: 0,
      maxEngagement: 0,
      totalStudents: 0,
      highEngagement: 0,
      mediumEngagement: 0,
      lowEngagement: 0
    };

    res.json({
      success: true,
      data: {
        distribution: distribution.map(bucket => ({
          range: bucket._id === 'other' ? '100+' : `${bucket._id}-${bucket._id + 20}`,
          rangeLabel: bucket._id === 'other' ? '100+' : `${bucket._id}%-${bucket._id + 20}%`,
          count: bucket.count,
          percentage: statsData.totalStudents > 0
            ? Math.round((bucket.count / statsData.totalStudents) * 100 * 100) / 100
            : 0
        })),
        stats: {
          avgEngagement: Math.round(statsData.avgEngagement * 100) / 100,
          minEngagement: Math.round(statsData.minEngagement * 100) / 100,
          maxEngagement: Math.round(statsData.maxEngagement * 100) / 100,
          totalStudents: statsData.totalStudents,
          highEngagement: statsData.highEngagement,
          mediumEngagement: statsData.mediumEngagement,
          lowEngagement: statsData.lowEngagement,
          highEngagementRate: statsData.totalStudents > 0
            ? Math.round((statsData.highEngagement / statsData.totalStudents) * 100 * 100) / 100
            : 0
        }
      },
      filters: { platform, productId }
    });

  } catch (error: any) {
    console.error('❌ Erro em getEngagementDistribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════
// 🔀 ENDPOINT 4: POST /api/dashboard/compare
// Compara 2 produtos lado a lado
// ═══════════════════════════════════════════════════════
export const compareProducts = async (req: Request, res: Response) => {
  try {
    const { productId1, productId2 } = req.body;

    if (!productId1 || !productId2) {
      return res.status(400).json({
        success: false,
        error: 'Necessário fornecer productId1 e productId2'
      });
    }

    // Buscar dados dos 2 produtos em paralelo
    const [product1Data, product2Data] = await Promise.all([
      getProductComparisonData(productId1),
      getProductComparisonData(productId2)
    ]);

    // Calcular diferenças percentuais e absolutas
    const comparison = {
      product1: product1Data,
      product2: product2Data,
      differences: {
        students: {
          absolute: product1Data.totalStudents - product2Data.totalStudents,
          percentage: calculatePercentageDiff(
            product1Data.totalStudents,
            product2Data.totalStudents
          ),
          winner: product1Data.totalStudents > product2Data.totalStudents ? 'product1' : 'product2'
        },
        engagement: {
          absolute: Math.round((product1Data.avgEngagement - product2Data.avgEngagement) * 100) / 100,
          percentage: calculatePercentageDiff(
            product1Data.avgEngagement,
            product2Data.avgEngagement
          ),
          winner: product1Data.avgEngagement > product2Data.avgEngagement ? 'product1' : 'product2'
        },
        progress: {
          absolute: Math.round((product1Data.avgProgress - product2Data.avgProgress) * 100) / 100,
          percentage: calculatePercentageDiff(
            product1Data.avgProgress,
            product2Data.avgProgress
          ),
          winner: product1Data.avgProgress > product2Data.avgProgress ? 'product1' : 'product2'
        },
        completion: {
          absolute: Math.round((product1Data.completionRate - product2Data.completionRate) * 100) / 100,
          percentage: calculatePercentageDiff(
            product1Data.completionRate,
            product2Data.completionRate
          ),
          winner: product1Data.completionRate > product2Data.completionRate ? 'product1' : 'product2'
        },
        activeRate: {
          absolute: Math.round((product1Data.activeRate - product2Data.activeRate) * 100) / 100,
          percentage: calculatePercentageDiff(
            product1Data.activeRate,
            product2Data.activeRate
          ),
          winner: product1Data.activeRate > product2Data.activeRate ? 'product1' : 'product2'
        }
      }
    };

    res.json({
      success: true,
      data: comparison
    });

  } catch (error: any) {
    console.error('❌ Erro em compareProducts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════
// 🔧 FUNÇÃO AUXILIAR: Buscar dados de comparação de 1 produto
// ═══════════════════════════════════════════════════════
async function getProductComparisonData(productId: string) {
  const productObjectId = new mongoose.Types.ObjectId(productId);

  const [stats, product] = await Promise.all([
    UserProduct.aggregate([
      { $match: { productId: productObjectId } },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          avgEngagement: { $avg: '$engagement.score' },
          avgProgress: { $avg: '$progress' },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          completedCount: {
            $sum: { $cond: [{ $gte: ['$progress', 100] }, 1, 0] }
          },
          highEngagement: {
            $sum: { $cond: [{ $gte: ['$engagement.score', 70] }, 1, 0] }
          }
        }
      }
    ]),
    Product.findById(productObjectId)
  ]);

  const data = stats[0] || {
    totalStudents: 0,
    avgEngagement: 0,
    avgProgress: 0,
    activeCount: 0,
    completedCount: 0,
    highEngagement: 0
  };

  return {
    productId,
    productName: product?.name || 'Desconhecido',
    productSlug: product?.slug || '',
    totalStudents: data.totalStudents,
    avgEngagement: Math.round(data.avgEngagement * 100) / 100,
    avgProgress: Math.round(data.avgProgress * 100) / 100,
    activeCount: data.activeCount,
    activeRate: data.totalStudents > 0
      ? Math.round((data.activeCount / data.totalStudents) * 100 * 100) / 100
      : 0,
    completedCount: data.completedCount,
    completionRate: data.totalStudents > 0
      ? Math.round((data.completedCount / data.totalStudents) * 100 * 100) / 100
      : 0,
    highEngagementCount: data.highEngagement,
    engagementRate: data.totalStudents > 0
      ? Math.round((data.highEngagement / data.totalStudents) * 100 * 100) / 100
      : 0
  };
}

// ═══════════════════════════════════════════════════════
// 🔧 FUNÇÃO AUXILIAR: Calcular diferença percentual
// ═══════════════════════════════════════════════════════
function calculatePercentageDiff(value1: number, value2: number): number {
  if (value2 === 0) return value1 > 0 ? 100 : 0;
  return Math.round(((value1 - value2) / value2) * 100 * 100) / 100;
}
