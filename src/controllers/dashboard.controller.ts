import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import UserProduct from '../models/UserProduct';
import User from '../models/user';
// 🔄 DUAL READ SERVICE - Combina V1 + V2
import { getAllUsersUnified, getUniqueUsersFromUnified } from '../services/dualReadService';

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
    console.log('📦 [PRODUCTS BREAKDOWN - DUAL READ]');
    const { platforms } = req.query;

    // 🔄 USAR DUAL READ
    const userProducts = await getAllUsersUnified();
    
    // Filtrar por plataforma se solicitado
    let filteredUPs = userProducts;
    if (platforms && typeof platforms === 'string') {
      const platformList = platforms.split(',').map(p => p.toLowerCase());
      filteredUPs = userProducts.filter(up => {
        const platform = up.platform || (up.productId as any)?.platform || '';
        return platformList.includes(platform.toLowerCase());
      });
    }

    // Agrupar por produto
    const productMap = new Map();

    filteredUPs.forEach(up => {
      const productId = up.productId?._id?.toString() || up.productId?.toString();
      if (!productId) return;

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          productName: up.productId?.name || 'Unknown',
          platform: up.platform || up.productId?.platform,
          students: new Set(),
          totalEngagement: 0,
          totalProgress: 0,
          activeStudents: new Set(),
          count: 0
        });
      }

      const data = productMap.get(productId);
      const userId = up.userId;
      const userIdStr = typeof userId === 'object' && userId._id 
        ? userId._id.toString() 
        : userId.toString();
      
      data.students.add(userIdStr);
      data.count++;
      data.totalEngagement += up.engagement?.engagementScore || 0;
      data.totalProgress += up.progress?.percentage || 0;  // ✅ CORRETO

      if (up.status === 'ACTIVE') {
        data.activeStudents.add(userIdStr);
      }
    });

    // Calcular médias
    const breakdown = Array.from(productMap.values()).map(data => ({
      productId: data.productId,
      productName: data.productName,
      platform: data.platform,
      totalStudents: data.students.size,
      avgEngagement: data.count > 0 
        ? Math.round((data.totalEngagement / data.count) * 10) / 10 
        : 0,
      avgProgress: data.count > 0 
        ? Math.round((data.totalProgress / data.count) * 10) / 10 
        : 0,
      activeStudents: data.activeStudents.size,
      engagementRate: data.students.size > 0
        ? Math.round((data.activeStudents.size / data.students.size) * 1000) / 10
        : 0
    })).sort((a, b) => b.totalStudents - a.totalStudents);

    console.log(`   ✅ ${breakdown.length} produtos analisados`);

    /* OLD AGGREGATION CODE - REMOVED
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
    */

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error: any) {
    console.error('❌ [PRODUCTS BREAKDOWN] Erro:', error);
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
    console.log('\n📊 [STATS V3 - DUAL READ] Calculando stats consolidadas...');
    const startTime = Date.now();

    // ========================================================================
    // 1. BUSCAR TODOS OS USER PRODUCTS (V1 + V2 UNIFICADOS)
    // ========================================================================
    const userProducts = await getAllUsersUnified();
    console.log(`   ✅ ${userProducts.length} UserProducts unificados`);

    // ========================================================================
    // 2. CALCULAR TOTAL DE ALUNOS ÚNICOS
    // ========================================================================
    const uniqueUserIds = new Set(
      userProducts
        .filter(up => up.userId)
        .map(up => {
          const userId = up.userId;
          return typeof userId === 'object' && userId._id 
            ? userId._id.toString() 
            : userId.toString();
        })
    );
    const totalStudents = uniqueUserIds.size;
    console.log(`   ✅ ${totalStudents} alunos únicos`);

    // ========================================================================
    // 3. CALCULAR ENGAGEMENT MÉDIO ✅ CORRIGIDO: AGRUPAR POR USER
    // ========================================================================
    // Agrupar UserProducts por userId e calcular média POR USER
    const userEngagements = new Map<string, number[]>();
    
    userProducts.forEach(up => {
      if (up.engagement?.engagementScore !== undefined && up.engagement.engagementScore > 0) {
        const userId = up.userId;
        const userIdStr = typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
        
        if (!userEngagements.has(userIdStr)) {
          userEngagements.set(userIdStr, []);
        }
        userEngagements.get(userIdStr)!.push(up.engagement.engagementScore);
      }
    });

    // Calcular média de engagement POR USER, depois média global
    let totalUserEngagement = 0;
    userEngagements.forEach(engagements => {
      const userAvg = engagements.reduce((a, b) => a + b, 0) / engagements.length;
      totalUserEngagement += userAvg;
    });

    const avgEngagement = userEngagements.size > 0
      ? totalUserEngagement / userEngagements.size
      : 0;

    console.log(`   ✅ Engagement médio: ${avgEngagement.toFixed(1)} (${userEngagements.size} alunos com dados)`);

    // ========================================================================
    // 4. CALCULAR PROGRESSO MÉDIO ✅ CORRIGIDO: AGRUPAR POR USER
    // ========================================================================
    // Agrupar UserProducts por userId e calcular média POR USER
    const userProgress = new Map<string, number[]>();
    
    userProducts.forEach(up => {
      if (up.progress?.percentage !== undefined && up.progress.percentage > 0) {
        const userId = up.userId;
        const userIdStr = typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
        
        if (!userProgress.has(userIdStr)) {
          userProgress.set(userIdStr, []);
        }
        userProgress.get(userIdStr)!.push(up.progress.percentage);
      }
    });

    // Calcular média de progresso POR USER, depois média global
    let totalUserProgress = 0;
    userProgress.forEach(progresses => {
      const userAvg = progresses.reduce((a, b) => a + b, 0) / progresses.length;
      totalUserProgress += userAvg;
    });

    const avgProgress = userProgress.size > 0
      ? totalUserProgress / userProgress.size
      : 0;

    console.log(`   ✅ Progresso médio: ${avgProgress.toFixed(1)}% (${userProgress.size} alunos com dados)`);

    // ========================================================================
    // 5. CALCULAR ALUNOS ATIVOS
    // ========================================================================
    const activeUserProducts = userProducts.filter(
      up => up.status === 'ACTIVE'
    );

    const activeUserIds = new Set(
      activeUserProducts.map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
    );
    const activeCount = activeUserIds.size;
    const activeRate = totalStudents > 0 
      ? (activeCount / totalStudents) * 100 
      : 0;

    console.log(`   ✅ ${activeCount} alunos ativos (${activeRate.toFixed(1)}%)`);

    // ========================================================================
    // 6. CALCULAR ALUNOS EM RISCO (engagement < 30)
    // ========================================================================
    const atRiskUserProducts = userProducts.filter(
      up => {
        const score = up.engagement?.engagementScore || 0;
        return score > 0 && score < 30; // Só conta se tiver engagement registado
      }
    );

    const atRiskUserIds = new Set(
      atRiskUserProducts.map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
    );
    const atRiskCount = atRiskUserIds.size;
    const atRiskRate = totalStudents > 0 
      ? (atRiskCount / totalStudents) * 100 
      : 0;

    console.log(`   🚨 ${atRiskCount} alunos em risco (${atRiskRate.toFixed(1)}%)`);

    // ========================================================================
    // 7. BREAKDOWN POR PLATAFORMA (CORRIGIDO!)
    // ========================================================================
    console.log(`   📊 Agrupando por plataforma...`);
    
    const platformCounts: Record<string, Set<string>> = {};

    userProducts.forEach(up => {
      const userId = up.userId;
      const userIdStr = typeof userId === 'object' && userId._id 
        ? userId._id.toString() 
        : userId.toString();
      
      // ✅ CORREÇÃO: Ler platform diretamente do UserProduct convertido
      // Cada UserProduct tem o campo 'platform' correto (hotmart, curseduca, discord)
      let platform = up.platform;
      
      // Fallback: se não tiver platform direto, tentar ler do productId
      if (!platform && up.productId) {
        platform = (up.productId as any).platform || 'unknown';
      }
      
      // Normalizar nome
      platform = platform.toLowerCase();
      
      if (!platformCounts[platform]) {
        platformCounts[platform] = new Set();
      }
      
      platformCounts[platform].add(userIdStr);
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

    console.log(`   ✅ ${byPlatform.length} plataformas:`);
    byPlatform.forEach(p => {
      console.log(`      ${p.icon} ${p.name}: ${p.count} (${p.percentage}%)`);
    });

    // ========================================================================
    // 8. PRODUTOS ATIVOS
    // ========================================================================
    const activeProducts = await Product.countDocuments({ 
      status: { $ne: 'inactive' } 
    });

    console.log(`   ✅ ${activeProducts} produtos ativos`);

    // ========================================================================
    // 9. HEALTH SCORE ✅ CORRIGIDO: CRESCIMENTO REAL + CÁLCULO POR USER
    // ========================================================================
    const retention = activeRate;
    
    // ✅ Calcular novos alunos últimos 30 dias (por userId único)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newUsers = new Set<string>();
    userProducts.forEach(up => {
      if (up.enrolledAt && new Date(up.enrolledAt) >= thirtyDaysAgo) {
        const userId = up.userId;
        const userIdStr = typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
        newUsers.add(userIdStr);
      }
    });
    
    const newUsersCount = newUsers.size;
    const growth = totalStudents > 0 
      ? (newUsersCount / totalStudents) * 100 
      : 0;
    
    console.log(`   📈 Crescimento: ${newUsersCount} novos alunos últimos 30 dias (${growth.toFixed(1)}%)`);
    
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

    console.log(`   🏥 Health Score: ${healthScore}/100 (${healthLevel})`);

    // ========================================================================
    // 10. QUICK FILTERS
    // ========================================================================
    
    // Top Performers (engagement > 80 E progresso > 70)
    const topPerformersUserProducts = userProducts.filter(
      up =>
        (up.engagement?.engagementScore || 0) > 80 &&
        (up.progress?.percentage || 0) > 70
    );
    const topPerformersCount = new Set(
      topPerformersUserProducts.map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
    ).size;

    // Inativos 30 dias (sem lastActivity nos últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactive30dUserProducts = userProducts.filter(up => {
      const lastActivity = up.progress?.lastActivity;
      if (!lastActivity) return true; // Se nunca teve activity, conta como inativo
      return new Date(lastActivity) < thirtyDaysAgo;
    });
    const inactive30dCount = new Set(
      inactive30dUserProducts.map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
    ).size;

    // Novos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const new7dUserProducts = userProducts.filter(up => {
      const enrolled = up.enrolledAt;
      if (!enrolled) return false;
      return new Date(enrolled) > sevenDaysAgo;
    });
    const new7dCount = new Set(
      new7dUserProducts.map(up => {
        const userId = up.userId;
        return typeof userId === 'object' && userId._id 
          ? userId._id.toString() 
          : userId.toString();
      })
    ).size;

    console.log(`   ✅ Quick Filters calculados`);

    // ========================================================================
    // 11. RESPONSE
    // ========================================================================
    const duration = Date.now() - startTime;
    console.log(`✅ [STATS V3] Calculado em ${duration}ms\n`);

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
          durationMs: duration,
          dualReadEnabled: true,
          v1Count: userProducts.filter((up: any) => up._isV1).length,
          v2Count: userProducts.filter((up: any) => !up._isV1).length
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
          progress: p.progress?.percentage || 0  // ✅ CORRIGIDO: percentage
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
