// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ SERVICE: Dashboard Stats Builder (Materialized View) - CORRIGIDO
// ═══════════════════════════════════════════════════════════════════════════
// Calcula e guarda stats do dashboard para carregamento instantâneo
// Chamado por CRON job e após syncs
// 
// CORREÇÕES APLICADAS:
// 1. ✅ At Risk: score < 30 (antes: < 40)
// 2. ✅ Top 10%: cálculo dinâmico (antes: score >= 60 fixo)
// 3. ✅ Novos 7d: usa enrolledAt (verificado - estava correto)
// 4. 🔍 Inativos 30d: logs debug adicionados para investigação
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
    
    // ✅ NOVO: Array para cálculo de Top 10%
    const userEngagementScores: Array<{ userId: string; score: number }> = [];
    
    let totalEngagement = 0;
    let totalProgress = 0;
    let activeUsers = 0;
    let atRiskUsers = 0;
    // Top performers será calculado depois!
    let newUsers7d = 0;
    let inactiveUsers30d = 0;
    
    // 🔍 DEBUG: Contadores para investigar Inativos 30d
    let inactiveNoActivity = 0;
    let inactiveLowEngagement = 0;
    
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
      
      // ✅ NOVO: Guardar score para cálculo de Top 10%
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
      
      // ✅ CORREÇÃO 1: At Risk (score < 30 OU sem engagement)
      // ANTES: < 40
      // AGORA: < 30 (baseado em dados reais)
      if (userAvgEngagement === 0 || userAvgEngagement < 30) {
        atRiskUsers++;
      }
      
      // ❌ REMOVIDO: Top Performers (era calculado aqui com threshold fixo)
      // Agora será calculado DEPOIS com Top 10% dinâmico
      
      // ✅ VERIFICADO: New users (últimos 7 dias) - CORRETO!
      if (metrics.enrolledAt && metrics.enrolledAt >= sevenDaysAgo) {
        newUsers7d++;
      }
      
      // 🔍 DEBUG: Inactive users - adicionar contadores para investigar
      const isInactiveNoActivity = !metrics.isActive;
      const isInactiveLowEngagement = userAvgEngagement < 20;
      
      if (isInactiveNoActivity) {
        inactiveNoActivity++;
      }
      
      if (isInactiveLowEngagement) {
        inactiveLowEngagement++;
      }
      
      if (isInactiveNoActivity || isInactiveLowEngagement) {
        inactiveUsers30d++;
      }
    });
    
    // ✅ CORREÇÃO 2: Calcular Top 10% DINAMICAMENTE
    console.log('🏆 Calculando Top 10%...');
    
    // 1. Ordenar por score (descendente)
    userEngagementScores.sort((a, b) => b.score - a.score);
    
    // 2. Calcular quantos são top 10%
    const top10Count = Math.ceil(userEngagementScores.length * 0.10);
    
    // 3. Top performers = top 10%
    const topPerformers = top10Count;
    
    // 4. Threshold = score mínimo para estar no top 10%
    const top10Threshold = userEngagementScores[top10Count - 1]?.score || 0;
    
    console.log(`   ✅ Top 10%: ${topPerformers} alunos (threshold: ${top10Threshold.toFixed(1)})`);
    
    // Continuar com cálculos...
    const totalUsers = userMetrics.size;
    const avgEngagement = totalUsers > 0 ? Math.round(totalEngagement / totalUsers) : 0;
    const avgProgress = totalUsers > 0 ? Math.round(totalProgress / totalUsers) : 0;
    const activeRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    const atRiskRate = totalUsers > 0 ? Math.round((atRiskUsers / totalUsers) * 100) : 0;
    
    // 🔍 DEBUG: Log para investigar Inativos 30d
    console.log(`😴 Inativos 30d breakdown:`);
    console.log(`   - Sem atividade (!isActive): ${inactiveNoActivity}`);
    console.log(`   - Engagement < 20: ${inactiveLowEngagement}`);
    console.log(`   - Total (OR): ${inactiveUsers30d}`);
    
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
    
// Mapeamento de plataformas para nomes e ícones
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
  const platformLower = platform.toLowerCase();
  
  return {
    name: platformNames[platformLower] || platform,
    icon: platformIcons[platformLower] || '📦',
    count: userIds.size,
    percentage: Math.round((userIds.size / totalUsers) * 100)
  };
});
    
    const platformDistribution = byPlatform.map(p => ({
      name: p.name,
      value: p.count,
      percentage: p.percentage
    }));
    
    console.log('   Distribuição calculada:');
    byPlatform.forEach(p => {
      console.log(`   - ${p.name}: ${p.count} alunos (${p.percentage}%)`);
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
    
    // 7. Guardar na BD (apagar antigo e criar novo)
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
        totalUserProducts: userProducts.length,
        uniqueUsers: totalUsers
      }
    });
    
    console.log('\n✅ ========================================');
    console.log(`✅ Dashboard Stats construídos em ${Math.round(calculationDuration/1000)}s`);
    console.log(`✅ ${totalUsers} alunos processados`);
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