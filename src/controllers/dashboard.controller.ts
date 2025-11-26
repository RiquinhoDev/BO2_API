import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import UserProduct from '../models/UserProduct';
import User from '../models/User';

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ENDPOINT 1: GET /api/dashboard/stats
// Estatísticas gerais para substituir Visão Geral V1
// ═══════════════════════════════════════════════════════════════════════════
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
      matchStage['progress.progressPercentage'] = {};
      if (progressMin) matchStage['progress.progressPercentage'].$gte = Number(progressMin);
      if (progressMax) matchStage['progress.progressPercentage'].$lte = Number(progressMax);
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

    const stats = await UserProduct.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          totalStudents: { $addToSet: '$userId' },
          avgEngagement: { $avg: '$engagement.engagementScore' },
          avgProgress: { $avg: '$progress.progressPercentage' },
          activeStudents: {
            $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
          },
          totalEnrollments: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          totalStudents: { $size: '$totalStudents' },
          avgEngagement: { $ifNull: ['$avgEngagement', 0] },
          avgProgress: { $ifNull: ['$avgProgress', 0] },
          activeStudents: 1,
          totalEnrollments: 1
        }
      }
    ]);

    const response = stats[0] || {
      totalStudents: 0,
      avgEngagement: 0,
      avgProgress: 0,
      activeStudents: 0,
      totalEnrollments: 0
    };

    // Calcular activeRate
    response.activeRate = response.totalEnrollments > 0
      ? (response.activeStudents / response.totalEnrollments) * 100
      : 0;

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

// ═══════════════════════════════════════════════════════════════════════════
// 📦 ENDPOINT 2: GET /api/dashboard/products
// Breakdown de alunos por produto
// ═══════════════════════════════════════════════════════════════════════════
export const getProductsBreakdown = async (req: Request, res: Response) => {
  try {
    const { platforms } = req.query;

    const matchStage: any = {};
    
    if (platforms && typeof platforms === 'string') {
      const platformList = platforms.split(',');
      const products = await Product.find({
        platform: { $in: platformList }
      }).select('_id');
      matchStage.productId = { $in: products.map(p => p._id) };
    }

    const breakdown = await UserProduct.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$productId',
          totalStudents: { $addToSet: '$userId' },
          avgEngagement: { $avg: '$engagement.engagementScore' },
          avgProgress: { $avg: '$progress.progressPercentage' },
          activeStudents: {
            $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          productId: '$_id',
          productName: '$product.name',
          platform: '$product.platform',
          totalStudents: { $size: '$totalStudents' },
          avgEngagement: { $ifNull: ['$avgEngagement', 0] },
          avgProgress: { $ifNull: ['$avgProgress', 0] },
          activeStudents: 1,
          engagementRate: {
            $multiply: [
              {
                $divide: [
                  { $ifNull: ['$avgEngagement', 0] },
                  100
                ]
              },
              100
            ]
          }
        }
      },
      { $sort: { totalStudents: -1 } }
    ]);

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error: any) {
    console.error('❌ Erro em getProductsBreakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📈 ENDPOINT 3: GET /api/dashboard/engagement
// Distribuição de engagement dos alunos
// ═══════════════════════════════════════════════════════════════════════════
export const getEngagementDistribution = async (req: Request, res: Response) => {
  try {
    const { productId } = req.query;

    const matchStage: any = {};
    if (productId) {
      matchStage.productId = new mongoose.Types.ObjectId(productId as string);
    }

    const distribution = await UserProduct.aggregate([
      { $match: matchStage },
      {
        $bucket: {
          groupBy: '$engagement.engagementScore',
          boundaries: [0, 30, 50, 70, 100],
          default: 'N/A',
          output: {
            count: { $sum: 1 },
            users: { $addToSet: '$userId' }
          }
        }
      }
    ]);

    const labels = ['churnRisk', 'moderate', 'good', 'excellent'];
    const result: any = {
      distribution: {},
      percentages: {},
      total: 0
    };

    distribution.forEach((bucket, index) => {
      const label = labels[index] || 'unknown';
      const uniqueUsers = new Set(bucket.users.map((id: any) => id.toString())).size;
      result.distribution[label] = uniqueUsers;
      result.total += uniqueUsers;
    });

    // Calcular percentagens
    Object.keys(result.distribution).forEach(key => {
      result.percentages[key] = result.total > 0
        ? Math.round((result.distribution[key] / result.total) * 100 * 10) / 10
        : 0;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Erro em getEngagementDistribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ⚖️ ENDPOINT 4: GET /api/dashboard/compare
// Comparar 2 produtos lado a lado
// ═══════════════════════════════════════════════════════════════════════════
export const compareProducts = async (req: Request, res: Response) => {
  try {
    const { productId1, productId2 } = req.query;

    if (!productId1 || !productId2) {
      return res.status(400).json({
        success: false,
        error: 'productId1 e productId2 são obrigatórios'
      });
    }

    // Buscar stats de ambos os produtos
    const getProductStats = async (productId: string) => {
      const stats = await UserProduct.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId) } },
        {
          $group: {
            _id: null,
            totalStudents: { $addToSet: '$userId' },
            avgEngagement: { $avg: '$engagement.engagementScore' },
            avgProgress: { $avg: '$progress.progressPercentage' },
            activeStudents: {
              $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        }
      ]);

      const product = await Product.findById(productId);

      return {
        productId,
        productName: product?.name || 'Unknown',
        platform: product?.platform || 'unknown',
        totalStudents: stats[0] ? stats[0].totalStudents.length : 0,
        avgEngagement: stats[0]?.avgEngagement || 0,
        avgProgress: stats[0]?.avgProgress || 0,
        activeStudents: stats[0]?.activeStudents || 0,
        engagementRate: stats[0]?.avgEngagement || 0
      };
    };

    const [product1, product2] = await Promise.all([
      getProductStats(productId1 as string),
      getProductStats(productId2 as string)
    ]);

    // Calcular diferenças
    const comparison = {
      studentsDiff: product1.totalStudents - product2.totalStudents,
      engagementDiff: product1.avgEngagement - product2.avgEngagement,
      progressDiff: product1.avgProgress - product2.avgProgress,
      winner: {
        students: product1.totalStudents > product2.totalStudents ? 'product1' : 'product2',
        engagement: product1.avgEngagement > product2.avgEngagement ? 'product1' : 'product2',
        progress: product1.avgProgress > product2.avgProgress ? 'product1' : 'product2'
      }
    };

    res.json({
      success: true,
      data: {
        product1,
        product2,
        comparison
      }
    });
  } catch (error: any) {
    console.error('❌ [COMPARE] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao comparar produtos'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 SPRINT 1: STATS V3 - VERSÃO CONSOLIDADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📊 GET DASHBOARD STATS V3 - VERSÃO CONSOLIDADA
 * Endpoint: GET /api/dashboard/stats/v3
 */
export const getDashboardStatsV3 = async (req: Request, res: Response) => {
  try {
    console.log('📊 [STATS V3] Calculando stats consolidadas...');
    const startTime = Date.now();

    const userProducts = await UserProduct.find()
      .populate('userId', 'name email')
      .populate('productId', 'name code platform')
      .lean();

    console.log(`   ✅ ${userProducts.length} UserProducts encontrados`);

    const uniqueUserIds = new Set(
      userProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    );
    const totalStudents = uniqueUserIds.size;

    const validEngagements = userProducts.filter(
      up => up.engagement?.engagementScore !== undefined
    );

    const avgEngagement = validEngagements.length > 0
      ? validEngagements.reduce(
          (sum, up) => sum + (up.engagement?.engagementScore || 0),
          0
        ) / validEngagements.length
      : 0;

    const activeUserProducts = userProducts.filter(
      up => up.status === 'ACTIVE'
    );

    const activeUserIds = new Set(
      activeUserProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    );
    const activeCount = activeUserIds.size;
    const activeRate = totalStudents > 0 
      ? (activeCount / totalStudents) * 100 
      : 0;

    const atRiskUserProducts = userProducts.filter(
      up => (up.engagement?.engagementScore || 0) < 30
    );

    const atRiskUserIds = new Set(
      atRiskUserProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    );
    const atRiskCount = atRiskUserIds.size;
    const atRiskRate = totalStudents > 0 
      ? (atRiskCount / totalStudents) * 100 
      : 0;

    const platformCounts: Record<string, Set<string>> = {};

    userProducts.forEach(up => {
      if (!up.userId || !(up.userId as any)._id) return;
      
      const platform = (up.productId as any)?.platform || 'unknown';
      
      if (!platformCounts[platform]) {
        platformCounts[platform] = new Set();
      }
      
      platformCounts[platform].add((up.userId as any)._id.toString());
    });

    const byPlatform = Object.entries(platformCounts).map(([name, userIds]) => {
      const count = userIds.size;
      const percentage = totalStudents > 0 
        ? (count / totalStudents) * 100 
        : 0;

      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        percentage: Math.round(percentage * 10) / 10,
        icon: name === 'hotmart' ? '🔥' : 
              name === 'curseduca' ? '📚' : 
              name === 'discord' ? '💬' : '🌟'
      };
    }).sort((a, b) => b.count - a.count);

    const activeProducts = await Product.countDocuments({ 
      status: { $ne: 'inactive' } 
    });

    const validProgress = userProducts.filter(
      up => up.progress?.progressPercentage !== undefined
    );

    const avgProgress = validProgress.length > 0
      ? validProgress.reduce(
          (sum, up) => sum + (up.progress?.progressPercentage || 0),
          0
        ) / validProgress.length
      : 0;

    const retention = activeRate;
    const growth = 15;
    
    const healthScore = Math.round(
      (avgEngagement * 0.4) +
      (retention * 0.3) +
      (growth * 0.2) +
      (avgProgress * 0.1)
    );

    const healthLevel = 
      healthScore >= 90 ? 'EXCELENTE' :
      healthScore >= 75 ? 'BOM' :
      healthScore >= 60 ? 'RAZOÁVEL' :
      'CRÍTICO';

    const topPerformersUserProducts = userProducts.filter(
      up =>
        (up.engagement?.engagementScore || 0) > 80 &&
        (up.progress?.progressPercentage || 0) > 70
    );
    const topPerformersCount = new Set(
      topPerformersUserProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    ).size;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactive30dUserProducts = userProducts.filter(up => {
      const lastActivity = up.progress?.lastActivity;
      if (!lastActivity) return true;
      return new Date(lastActivity) < thirtyDaysAgo;
    });
    const inactive30dCount = new Set(
      inactive30dUserProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    ).size;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const new7dUserProducts = userProducts.filter(up => {
      const enrolled = up.enrolledAt;
      if (!enrolled) return false;
      return new Date(enrolled) > sevenDaysAgo;
    });
    const new7dCount = new Set(
      new7dUserProducts
        .filter(up => up.userId && (up.userId as any)._id)
        .map(up => (up.userId as any)._id.toString())
    ).size;

    const duration = Date.now() - startTime;
    console.log(`✅ [STATS V3] Calculado em ${duration}ms`);

    res.json({
      success: true,
      data: {
        overview: {
          totalStudents,
          avgEngagement: Math.round(avgEngagement * 10) / 10,
          avgProgress: Math.round(avgProgress * 10) / 10,
          activeCount,
          activeRate: Math.round(activeRate * 10) / 10,
          atRiskCount,
          atRiskRate: Math.round(atRiskRate * 10) / 10,
          activeProducts,
          healthScore,
          healthLevel,
          healthBreakdown: {
            engagement: Math.round(avgEngagement * 10) / 10,
            retention: Math.round(retention * 10) / 10,
            growth,
            progress: Math.round(avgProgress * 10) / 10
          }
        },
        byPlatform,
        quickFilters: {
          atRisk: atRiskCount,
          topPerformers: topPerformersCount,
          inactive30d: inactive30dCount,
          new7d: new7dCount
        },
        meta: {
          calculatedAt: new Date().toISOString(),
          durationMs: duration
        }
      }
    });

  } catch (error: any) {
    console.error('❌ [STATS V3] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao calcular stats'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SPRINT 2: PESQUISA GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔍 PESQUISA GLOBAL
 * Endpoint: GET /api/dashboard/search?q=termo
 */
export const searchDashboard = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" é obrigatório'
      });
    }
    if (q.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }
    console.log(`🔍 [SEARCH] Procurando: "${q}"`);

    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    })
      .limit(10)
      .select('name email')
      .lean();

    console.log(`   ✅ ${users.length} users encontrados`);

    const userIds = users.map(u => u._id);
    const userProducts = await UserProduct.find({
      userId: { $in: userIds }
    })
      .populate('productId', 'name code platform')
      .lean();

    const results = users.map(user => {
      const products = userProducts.filter(
        up => up.userId.toString() === user._id.toString()
      );

      const avgEngagement =
        products.length > 0
          ? products.reduce(
              (sum, p) => sum + (p.engagement?.engagementScore || 0),
              0
            ) / products.length
          : 0;

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        products: products.map(p => ({
          _id: p._id,
          productId: (p.productId as any)?._id,
          productName: (p.productId as any)?.name,
          platform: (p.productId as any)?.platform,
          status: p.status,
          engagement: p.engagement?.engagementScore || 0,
          progress: p.progress?.progressPercentage || 0
        })),
        avgEngagement: Math.round(avgEngagement * 10) / 10,
        tags: products.flatMap(p => p.activeCampaignData?.tags || [])
      };
    });

    res.json({
      success: true,
      data: results,
      meta: {
        query: q,
        count: results.length
      }
    });

  } catch (error: any) {
    console.error('❌ [SEARCH] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
