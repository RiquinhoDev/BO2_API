// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ SERVICE: Dashboard Stats Builder (Materialized View)
// ═══════════════════════════════════════════════════════════════════════════
// Calcula e guarda stats do dashboard para carregamento instantâneo
// Chamado por CRON job e após syncs
// ═══════════════════════════════════════════════════════════════════════════

import { DashboardStats } from '../models/DashboardStats';
import { getAllUsersUnified } from './dualReadService';

/**
 * 🏗️ Construir e guardar stats do dashboard
 * Executa cálculo completo e guarda resultado na BD
 */
export async function buildDashboardStats(): Promise<void> {
  console.log('\n🏗️ ========================================');
  console.log('🏗️ CONSTRUINDO DASHBOARD STATS (Materialized View)');
  console.log('🏗️ ========================================\n');
  
  const startTime = Date.now();
  
  try {
    // 1. Buscar dados unificados (usa cache se disponível)
    console.log('📊 Buscando UserProducts unificados...');
    const userProducts = await getAllUsersUnified();
    console.log(`   ✅ ${userProducts.length} UserProducts carregados`);
    
    // 2. Agrupar por userId para cálculos corretos
    console.log('🔄 Agrupando por userId...');
    const userMetrics = new Map<string, {
      engagements: number[];
      progresses: number[];
      isActive: boolean;
      enrolledAt: Date | null;
      platforms: Set<string>;
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
          platforms: new Set()
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
      
      // Platforms
      if (up.platform) {
        metrics.platforms.add(up.platform);
      }
    });
    
    console.log(`   ✅ ${userMetrics.size} alunos únicos agrupados`);
    
    // 3. Calcular métricas agregadas
    console.log('📊 Calculando métricas...');
    
    let totalEngagement = 0;
    let totalProgress = 0;
    let activeUsers = 0;
    let atRiskUsers = 0;
    let topPerformers = 0;
    let newUsers7d = 0;
    let inactiveUsers30d = 0;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    userMetrics.forEach(metrics => {
      // Engagement médio do user
      const userAvgEngagement = metrics.engagements.length > 0
        ? metrics.engagements.reduce((a, b) => a + b, 0) / metrics.engagements.length
        : 0;
      totalEngagement += userAvgEngagement;
      
      // Progress médio do user
      const userAvgProgress = metrics.progresses.length > 0
        ? metrics.progresses.reduce((a, b) => a + b, 0) / metrics.progresses.length
        : 0;
      totalProgress += userAvgProgress;
      
      // Status
      if (metrics.isActive) {
        activeUsers++;
      }
      
      // At Risk (engagement < 40)
      if (userAvgEngagement > 0 && userAvgEngagement < 40) {
        atRiskUsers++;
      }
      
      // Top Performers (engagement >= 60)
      if (userAvgEngagement >= 60) {
        topPerformers++;
      }
      
      // New users (últimos 7 dias)
      if (metrics.enrolledAt && metrics.enrolledAt >= sevenDaysAgo) {
        newUsers7d++;
      }
      
      // Inactive users (engagement muito baixo ou sem atividade)
      if (!metrics.isActive || userAvgEngagement < 20) {
        inactiveUsers30d++;
      }
    });
    
    const totalUsers = userMetrics.size;
    const avgEngagement = totalUsers > 0 ? Math.round(totalEngagement / totalUsers) : 0;
    const avgProgress = totalUsers > 0 ? Math.round(totalProgress / totalUsers) : 0;
    const activeRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    const atRiskRate = totalUsers > 0 ? Math.round((atRiskUsers / totalUsers) * 100) : 0;
    
    // 4. Calcular distribuição por plataforma
    console.log('🌐 Calculando distribuição por plataforma...');
    
    const platformCounts = new Map<string, Set<string>>();
    
    userProducts.forEach(up => {
      if (!up.platform) return;
      
      const userId = typeof up.userId === 'object' && up.userId._id 
        ? up.userId._id.toString() 
        : up.userId.toString();
      
      if (!platformCounts.has(up.platform)) {
        platformCounts.set(up.platform, new Set());
      }
      platformCounts.get(up.platform)!.add(userId);
    });
    
    const platformDistribution: any = {};
    const byPlatform: any[] = [];
    
    // Mapeamento de plataformas para UI
    const platformMapping: { [key: string]: { name: string; icon: string } } = {
      'hotmart': { name: 'Hotmart', icon: '🛒' },
      'curseduca': { name: 'CursEduca', icon: '📚' },
      'discord': { name: 'Discord', icon: '💬' },
      'udemy': { name: 'Udemy', icon: '🎓' },
      'shopify': { name: 'Shopify', icon: '🛍️' }
    };
    
    platformCounts.forEach((userSet, platform) => {
      const count = userSet.size;
      const percentage = totalUsers > 0 ? Math.round((count / totalUsers) * 100 * 10) / 10 : 0;
      
      platformDistribution[platform] = { count, percentage };
      
      // Transformar para formato esperado pelo frontend
      const platformInfo = platformMapping[platform.toLowerCase()] || { 
        name: platform.charAt(0).toUpperCase() + platform.slice(1), 
        icon: '📦' 
      };
      
      byPlatform.push({ 
        name: platformInfo.name,
        count: count,
        percentage: percentage,
        icon: platformInfo.icon,
        platform: platform // manter original para filtros
      });
    });
    
    // 5. Calcular Health Score
    const retention = activeRate;
    const growth = totalUsers > 0 ? Math.round((newUsers7d / totalUsers) * 100) : 0;
    
    const healthScore = Math.round(
      (avgEngagement * 0.4) +
      (retention * 0.3) +
      (growth * 0.2) +
      (avgProgress * 0.1)
    );
    
    const healthLevel = 
      healthScore >= 90 ? 'EXCELENTE' :
      healthScore >= 75 ? 'BOM' :
      healthScore >= 60 ? 'RAZOÁVEL' : 'CRÍTICO';
    
    // Health Breakdown (componentes do health score)
    const healthBreakdown = {
      engagement: avgEngagement,
      retention: retention,
      growth: growth,
      progress: avgProgress
    };
    
    // 6. Calcular próxima atualização (6 horas)
    const nextUpdate = new Date();
    nextUpdate.setHours(nextUpdate.getHours() + 6);
    
    const calculationDuration = Date.now() - startTime;
    
    // 7. Guardar na BD (apagar antigo e criar novo para garantir estrutura correta)
    console.log('💾 Guardando stats na BD...');
    
    // Apagar stats antigos (garante estrutura atualizada)
    await DashboardStats.deleteMany({ version: 'v3' });
    
    // Criar novo documento
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
          new7d: newUsers7d, // Alias para compatibilidade
          atRisk: atRiskUsers,
          topPerformers,
          inactive30d: inactiveUsers30d
        },
        platformDistribution,
        meta: {
          calculationDuration,
          nextUpdate,
          dataFreshness: 'FRESH',
          totalUserProducts: userProducts.length,
          uniqueUsers: totalUsers
        }
    });
    
    console.log('\n✅ ========================================');
    console.log(`✅ Dashboard Stats construídos em ${Math.round(calculationDuration/1000)}s`);
    console.log(`✅ ${totalUsers} alunos processados`);
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

