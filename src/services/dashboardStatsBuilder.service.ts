// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ SERVICE: Dashboard Stats Builder - VERSÃO FINAL 100%
// ═══════════════════════════════════════════════════════════════════════════
// ✅ CORRIGIDO: Conta apenas isPrimary=true para CursEDuca
// ✅ CORRIGIDO: At Risk < 30
// ✅ CORRIGIDO: Top 10% dinâmico
// ✅ CORRIGIDO: Inativos 30d com lógica AND
// ✅ CORRIGIDO: Plataformas normalizadas
// ✅ CORRIGIDO: Users únicos com Set
// ═══════════════════════════════════════════════════════════════════════════

import { DashboardStats } from '../models/DashboardStats';
import { getAllUsersUnified } from './dualReadService';

/**
 * 🏗️ Construir e guardar stats do dashboard
 */
export async function buildDashboardStats(): Promise<void> {
  console.log('\n🏗️ ========================================');
  console.log('🏗️ CONSTRUINDO DASHBOARD STATS (Materialized View)');
  console.log('🏗️ ========================================\n');
  
  const startTime = Date.now();
  
  try {
    // 1. Buscar dados unificados
    console.log('📊 Buscando UserProducts unificados...');
    const allUserProducts = await getAllUsersUnified();
    console.log(`   ✅ ${allUserProducts.length} UserProducts carregados`);
    
    // ✅ FILTRAR APENAS isPrimary=true (para evitar duplicados)
    const userProducts = allUserProducts.filter(up => {
      // Para CursEDuca: só conta se isPrimary=true
      if (up.platform?.toLowerCase() === 'curseduca') {
        return up.isPrimary === true;
      }
      // Para outras plataformas: conta tudo
      return true;
    });
    
    console.log(`   📦 ${userProducts.length} UserProducts após filtrar isPrimary`);
    console.log(`   🔁 ${allUserProducts.length - userProducts.length} produtos secundários removidos`);
    
    // 2. Agrupar por userId
    console.log('🔄 Agrupando por userId...');
    const userMetrics = new Map<string, {
      engagements: number[];
      progresses: number[];
      isActive: boolean;
      enrolledAt: Date | null;
      platforms: Set<string>;
      lastActivity: Date | null;
    }>();
    
    userProducts.forEach(up => {
      const userId = typeof up.userId === 'object' && up.userId._id 
        ? up.userId._id.toString() 
        : up.userId.toString();
      
      if (!userMetrics.has(userId)) {
        userMetrics.set(userId, {
          engagements: [],
          progresses: [],
          isActive: false,
          enrolledAt: null,
          platforms: new Set(),
          lastActivity: null
        });
      }
      
      const metrics = userMetrics.get(userId)!;
      
      // Engagement
      if (up.engagement?.engagementScore !== undefined && up.engagement.engagementScore > 0) {
        metrics.engagements.push(up.engagement.engagementScore);
      }
      
      // Progress
      if (up.progress?.percentage !== undefined && up.progress.percentage >= 0) {
        metrics.progresses.push(up.progress.percentage);
      }
      
      // Status
      if (up.status === 'ACTIVE') {
        metrics.isActive = true;
      }
      
      // Enrollment date
      if (up.enrolledAt) {
        const enrollDate = new Date(up.enrolledAt);
        if (!metrics.enrolledAt || enrollDate < metrics.enrolledAt) {
          metrics.enrolledAt = enrollDate;
        }
      }
      
      // Last Activity
      if (up.engagement?.lastAction) {
        const lastActionDate = new Date(up.engagement.lastAction);
        if (!metrics.lastActivity || lastActionDate > metrics.lastActivity) {
          metrics.lastActivity = lastActionDate;
        }
      }
      
      // Plataforma normalizada
      if (up.platform) {
        const normalizedPlatform = up.platform.toLowerCase();
        metrics.platforms.add(normalizedPlatform);
      }
    });
    
    console.log(`   ✅ ${userMetrics.size} alunos únicos agrupados`);
    
    // 3. Calcular métricas agregadas
    console.log('📊 Calculando métricas...');
    
    const userEngagementScores: Array<{ userId: string; score: number }> = [];
    
    let totalEngagement = 0;
    let totalProgress = 0;
    let activeUsers = 0;
    let atRiskUsers = 0;
    let newUsers7d = 0;
    let inactiveUsers30d = 0;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    userMetrics.forEach((metrics, userId) => {
      // Engagement médio do user
      const userAvgEngagement = metrics.engagements.length > 0
        ? metrics.engagements.reduce((a, b) => a + b, 0) / metrics.engagements.length
        : 0;
      totalEngagement += userAvgEngagement;
      
      userEngagementScores.push({ userId, score: userAvgEngagement });
      
      // Progress médio do user
      const userAvgProgress = metrics.progresses.length > 0
        ? metrics.progresses.reduce((a, b) => a + b, 0) / metrics.progresses.length
        : 0;
      totalProgress += userAvgProgress;
      
      // Status
      if (metrics.isActive) {
        activeUsers++;
      }
      
      // ✅ At Risk (score < 30)
      if (userAvgEngagement === 0 || userAvgEngagement < 30) {
        atRiskUsers++;
      }
      
      // New users (últimos 7 dias)
      if (metrics.enrolledAt && metrics.enrolledAt >= sevenDaysAgo) {
        newUsers7d++;
      }
      
      // ✅ Inativos 30d (lógica AND)
      const hasNoRecentActivity = !metrics.lastActivity || metrics.lastActivity < thirtyDaysAgo;
      const hasLowEngagement = userAvgEngagement < 20;
      
      if ((!metrics.isActive && hasNoRecentActivity) || (hasLowEngagement && hasNoRecentActivity)) {
        inactiveUsers30d++;
      }
    });
    
    // ✅ Top 10% dinâmico
    console.log('🏆 Calculando Top 10%...');
    
    userEngagementScores.sort((a, b) => b.score - a.score);
    const top10Count = Math.ceil(userEngagementScores.length * 0.10);
    const topPerformers = top10Count;
    const top10Threshold = top10Count > 0 ? userEngagementScores[top10Count - 1]?.score || 0 : 0;
    
    console.log(`   ✅ Top 10%: ${topPerformers} alunos (threshold: ${top10Threshold.toFixed(1)})`);
    
    // Médias
    const totalUsers = userMetrics.size;
    const avgEngagement = totalUsers > 0 ? Math.round(totalEngagement / totalUsers) : 0;
    const avgProgress = totalUsers > 0 ? Math.round(totalProgress / totalUsers) : 0;
    const activeRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    const atRiskRate = totalUsers > 0 ? Math.round((atRiskUsers / totalUsers) * 100) : 0;
    
    // 4. Calcular distribuição por plataforma (USERS ÚNICOS)
    console.log('🌐 Calculando distribuição por plataforma...');
    
    const platformCounts = new Map<string, Set<string>>();
    const platformProductCounts = new Map<string, number>();
    
    userProducts.forEach(up => {
      if (!up.platform) return;
      
      const userId = typeof up.userId === 'object' && up.userId._id 
        ? up.userId._id.toString() 
        : up.userId.toString();
      
      const platformNormalized = up.platform.toLowerCase();
      
      // Contar UserProducts (debug)
      platformProductCounts.set(
        platformNormalized,
        (platformProductCounts.get(platformNormalized) || 0) + 1
      );
      
      // Adicionar user ao Set (garante unicidade)
      if (!platformCounts.has(platformNormalized)) {
        platformCounts.set(platformNormalized, new Set());
      }
      
      platformCounts.get(platformNormalized)!.add(userId);
    });
    
    const platformIcons: Record<string, string> = {
      'hotmart': '🛒',
      'curseduca': '🎓',
      'discord': '💬'
    };
    
    const platformNames: Record<string, string> = {
      'hotmart': 'Hotmart',
      'curseduca': 'CursEduca',
      'discord': 'Discord'
    };
    
    const byPlatform = Array.from(platformCounts.entries()).map(([platform, userIds]) => {
      const uniqueUsers = userIds.size;
      const totalUserProducts = platformProductCounts.get(platform) || 0;
      
      return {
        name: platformNames[platform] || platform.charAt(0).toUpperCase() + platform.slice(1),
        icon: platformIcons[platform] || '📦',
        count: uniqueUsers,
        percentage: Math.round((uniqueUsers / totalUsers) * 100),
        _debug: {
          userProducts: totalUserProducts,
          ratio: (totalUserProducts / uniqueUsers).toFixed(2)
        }
      };
    }).sort((a, b) => b.count - a.count);
    
    const platformDistribution = byPlatform.map(p => ({
      name: p.name,
      value: p.count,
      percentage: p.percentage
    }));
    
    console.log('   ✅ Distribuição (USERS ÚNICOS):');
    byPlatform.forEach(p => {
      console.log(`   - ${p.name}: ${p.count} users (${p.percentage}%) | ${p._debug.userProducts} UserProducts`);
    });
    
    // 5. Calcular Health Score
    console.log('💊 Calculando Health Score...');
    
    const retention = Math.min(100, Math.round((activeUsers / totalUsers) * 100));
    const growth = Math.min(100, Math.round((newUsers7d / totalUsers) * 1000));
    
    const healthScore = Math.round(
      (avgEngagement * 0.4) + 
      (retention * 0.3) + 
      (growth * 0.2) + 
      (avgProgress * 0.1)
    );
    
    const healthLevel = 
      healthScore >= 85 ? 'EXCELENTE' :
      healthScore >= 75 ? 'BOM' :
      healthScore >= 60 ? 'RAZOÁVEL' : 'CRÍTICO';
    
    const healthBreakdown = {
      engagement: avgEngagement,
      retention: retention,
      growth: growth,
      progress: avgProgress
    };
    
    console.log(`   ✅ Health Score: ${healthScore} (${healthLevel})`);
    
    // 6. Calcular próxima atualização (6 horas)
    const nextUpdate = new Date();
    nextUpdate.setHours(nextUpdate.getHours() + 6);
    
    const calculationDuration = Date.now() - startTime;
    
    // 7. Guardar na BD
    console.log('💾 Guardando stats na BD...');
    
    await DashboardStats.deleteMany({ version: 'v3' });
    
    await DashboardStats.create({
      version: 'v3',
      calculatedAt: new Date(),
      overview: {
        totalStudents: totalUsers,
        avgEngagement,
        avgProgress,
        activeCount: activeUsers,
        activeRate,
        atRiskCount: atRiskUsers,
        atRiskRate,
        activeProducts: platformCounts.size,
        healthScore,
        healthLevel,
        healthBreakdown
      },
      byPlatform,
      quickFilters: {
        newStudents: newUsers7d,
        new7d: newUsers7d,
        atRisk: atRiskUsers,
        topPerformers,
        inactive30d: inactiveUsers30d
      },
      platformDistribution,
      meta: {
        calculationDuration,
        nextUpdate,
        dataFreshness: 'FRESH',
        totalUserProducts: allUserProducts.length,
        primaryUserProducts: userProducts.length,
        secondaryUserProducts: allUserProducts.length - userProducts.length,
        uniqueUsers: totalUsers
      }
    });
    
    console.log('\n✅ ========================================');
    console.log(`✅ Dashboard Stats construídos em ${Math.round(calculationDuration/1000)}s`);
    console.log(`✅ ${totalUsers} alunos únicos processados`);
    console.log(`✅ Quick Filters:`);
    console.log(`   🚨 Em Risco: ${atRiskUsers} (score < 30)`);
    console.log(`   🏆 Top 10%: ${topPerformers} (threshold: ${top10Threshold.toFixed(1)})`);
    console.log(`   😴 Inativos 30d: ${inactiveUsers30d}`);
    console.log(`   📅 Novos 7d: ${newUsers7d}`);
    console.log(`✅ Próxima atualização: ${nextUpdate.toLocaleString('pt-PT')}`);
    console.log('✅ ========================================\n');
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ ERRO ao construir Dashboard Stats:', error);
    console.error('❌ ========================================\n');
    throw error;
  }
}

/**
 * 📖 Ler stats do dashboard (RÁPIDO - 50ms)
 */
export async function getDashboardStats(): Promise<any> {
  console.log('📖 [GETTER] Lendo Dashboard Stats da BD...');
  
  const stats = await DashboardStats.findOne({ version: 'v3' }).lean();
  
  if (!stats) {
    console.warn('⚠️  Dashboard Stats não encontrados! Construindo...');
    await buildDashboardStats();
    return await DashboardStats.findOne({ version: 'v3' }).lean();
  }
  
  // Verificar freshness
  const age = Date.now() - new Date(stats.calculatedAt).getTime();
  const ageHours = age / (1000 * 60 * 60);
  
  if (ageHours > 24) {
    stats.meta.dataFreshness = 'VERY_STALE';
  } else if (ageHours > 12) {
    stats.meta.dataFreshness = 'STALE';
  } else {
    stats.meta.dataFreshness = 'FRESH';
  }
  
  return stats;
}