import logger from '../utils/logger'
import { DashboardStats } from '../models/DashboardStats'
import { calculateHealthScore } from './analytics/healthScore'
import { getAllUsersUnified } from './syncUtilizadoresServices/dualReadService'

/**
 * 🏗️ Construir e guardar stats do dashboard
 */
export async function buildDashboardStats(): Promise<void> {
  logger.info('\n🏗️ ========================================')
  logger.info('🏗️ CONSTRUINDO DASHBOARD STATS (Materialized View)')
  logger.info('🏗️ ========================================\n')
  
  const startTime = Date.now()
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: FETCH USERPRODUCTS (FILTRAR isPrimary)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('📊 Buscando UserProducts unificados...')
    const allUserProducts = await getAllUsersUnified()
    
    logger.info(`   ✅ ${allUserProducts.length} UserProducts total`)
    
    // ✅ CRITICAL: Filtrar apenas isPrimary=true para CursEDuca
    const userProducts = allUserProducts.filter(up => {
      if (up.platform?.toLowerCase() === 'curseduca') {
        return up.isPrimary === true
      }
      return true
    })
    
    logger.info(`   📦 ${userProducts.length} UserProducts após filtrar isPrimary`)
    logger.info(`   🔁 ${allUserProducts.length - userProducts.length} produtos secundários removidos`)
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: AGRUPAR POR USERID (USERS ÚNICOS!)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('🔄 Agrupando por userId...')
    
    const byUserId = new Map<string, {
      products: Array<Awaited<ReturnType<typeof getAllUsersUnified>>[number]>
      engagements: number[]
      progresses: number[]
      isActive: boolean
      enrolledAt: Date | null
      platforms: Set<string>
      lastActivity: Date | null
    }>()
    
    for (const up of userProducts) {
      const userId = typeof up.userId === 'object' && (up.userId as any)._id 
        ? (up.userId as any)._id.toString() 
        : up.userId.toString()
      
      if (!byUserId.has(userId)) {
        byUserId.set(userId, {
          products: [],
          engagements: [],
          progresses: [],
          isActive: false,
          enrolledAt: null,
          platforms: new Set(),
          lastActivity: null
        })
      }
      
      const user = byUserId.get(userId)!
      user.products.push(up)
      
      // Engagement
      if (up.engagement?.engagementScore !== undefined && up.engagement.engagementScore > 0) {
        user.engagements.push(up.engagement.engagementScore)
      }
      
      // Progress
      if (up.progress?.percentage !== undefined && up.progress.percentage >= 0) {
        user.progresses.push(up.progress.percentage)
      }
      
      // Status
      if (up.status === 'ACTIVE') {
        user.isActive = true
      }
      
      // Enrollment date (mais antigo)
      if (up.enrolledAt) {
        const enrollDate = new Date(up.enrolledAt)
        if (!user.enrolledAt || enrollDate < user.enrolledAt) {
          user.enrolledAt = enrollDate
        }
      }
      
      // Last Activity (mais recente)
      if (up.engagement?.lastAction) {
        const lastActionDate = new Date(up.engagement.lastAction)
        if (!user.lastActivity || lastActionDate > user.lastActivity) {
          user.lastActivity = lastActionDate
        }
      }
      
      // Plataforma normalizada
      if (up.platform) {
        user.platforms.add(up.platform.toLowerCase())
      }
    }
    
    const uniqueStudents = byUserId.size
    
    logger.info(`   ✅ ${uniqueStudents} alunos únicos agrupados`)
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: CALCULAR MÉTRICAS (POR USER)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('📊 Calculando métricas...')
    
    const userScores: Array<{ userId: string; score: number }> = []
    
    let totalEngagement = 0
    let totalProgress = 0
    let activeCount = 0
    let atRiskCount = 0
    let newUsers7d = 0
    let inactiveUsers30d = 0
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    for (const [userId, user] of byUserId.entries()) {
      // Engagement médio do user (média de todos os produtos)
      const userEngagement = user.engagements.length > 0
        ? user.engagements.reduce((sum, e) => sum + e, 0) / user.engagements.length
        : 0
      
      totalEngagement += userEngagement
      userScores.push({ userId, score: userEngagement })
      
      // Progress médio do user
      const userProgress = user.progresses.length > 0
        ? user.progresses.reduce((sum, p) => sum + p, 0) / user.progresses.length
        : 0
      
      totalProgress += userProgress
      
      // ✅ ATIVO: tem status ACTIVE
      if (user.isActive) {
        activeCount++
      }
      
      // ✅ EM RISCO: score < 30
      if (userEngagement < 30) {
        atRiskCount++
      }
      
      // Novos últimos 7 dias
      if (user.enrolledAt && user.enrolledAt >= sevenDaysAgo) {
        newUsers7d++
      }
      
      // ✅ INATIVOS 30d: (não ativo E sem atividade recente) OU (engagement baixo E sem atividade)
      const hasNoRecentActivity = !user.lastActivity || user.lastActivity < thirtyDaysAgo
      const hasLowEngagement = userEngagement < 20
      
      if ((!user.isActive && hasNoRecentActivity) || (hasLowEngagement && hasNoRecentActivity)) {
        inactiveUsers30d++
      }
    }
    
    // Médias
    const avgEngagement = uniqueStudents > 0 
      ? Math.round(totalEngagement / uniqueStudents) 
      : 0
    
    const avgProgress = uniqueStudents > 0 
      ? Math.round(totalProgress / uniqueStudents) 
      : 0
    
    const activeRate = uniqueStudents > 0 
      ? Math.round((activeCount / uniqueStudents) * 100) 
      : 0
    
    const atRiskRate = uniqueStudents > 0 
      ? Math.round((atRiskCount / uniqueStudents) * 100) 
      : 0
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: CALCULAR TOP 10% (DINÂMICO)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('🏆 Calculando Top 10%...')
    
    userScores.sort((a, b) => b.score - a.score)
    
    const top10Count = Math.ceil(uniqueStudents * 0.10)
    const top10Threshold = top10Count > 0 ? userScores[top10Count - 1]?.score || 0 : 0
    const topPerformers = userScores.filter(u => u.score >= top10Threshold).length
    
    logger.info(`   ✅ Top 10%: ${topPerformers} alunos (threshold: ${top10Threshold.toFixed(1)})`)
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5: DISTRIBUIÇÃO POR PLATAFORMA (USERS ÚNICOS)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('🌐 Calculando distribuição por plataforma...')
    
    const platformUsers = new Map<string, Set<string>>()
    const platformProducts = new Map<string, number>()
    
    for (const up of userProducts) {
      if (!up.platform) continue
      
      const userId = typeof up.userId === 'object' && (up.userId as any)._id 
        ? (up.userId as any)._id.toString() 
        : up.userId.toString()
      
      const platform = up.platform.toLowerCase()
      
      // Users únicos por plataforma
      if (!platformUsers.has(platform)) {
        platformUsers.set(platform, new Set())
      }
      platformUsers.get(platform)!.add(userId)
      
      // Contar UserProducts (debug)
      platformProducts.set(platform, (platformProducts.get(platform) || 0) + 1)
    }
    
    const platformIcons: Record<string, string> = {
      'hotmart': '🔥',
      'curseduca': '📚',
      'discord': '💬'
    }
    
    const platformNames: Record<string, string> = {
      'hotmart': 'Hotmart',
      'curseduca': 'CursEDuca',
      'discord': 'Discord'
    }
    
    const byPlatform = Array.from(platformUsers.entries())
      .map(([platform, userIds]) => {
        const uniqueUsers = userIds.size
        const totalProducts = platformProducts.get(platform) || 0
        
        return {
          name: platformNames[platform] || platform.charAt(0).toUpperCase() + platform.slice(1),
          icon: platformIcons[platform] || '📦',
          count: uniqueUsers,
          percentage: Math.round((uniqueUsers / uniqueStudents) * 100),
          _debug: {
            userProducts: totalProducts,
            ratio: (totalProducts / uniqueUsers).toFixed(2)
          }
        }
      })
      .sort((a, b) => b.count - a.count)
    
    logger.info('   ✅ Distribuição (USERS ÚNICOS):')
    byPlatform.forEach(p => {
      logger.info(`   - ${p.name}: ${p.count} users (${p.percentage}%) | ${p._debug.userProducts} UserProducts`)
    })
    
    const platformDistribution = byPlatform.map(p => ({
      name: p.name,
      value: p.count,
      percentage: p.percentage
    }))
    
    // ═══════════════════════════════════════════════════════════
    // STEP 6: CALCULAR HEALTH SCORE
    // ═══════════════════════════════════════════════════════════
    
    logger.info('💊 Calculando Health Score...')
    
    const { healthScore, healthLevel, healthBreakdown } = calculateHealthScore({
      avgEngagement,
      activeCount,
      totalCount: uniqueStudents,
      newLast7Days: newUsers7d,
      avgProgress,
    })
    
    logger.info(`   ✅ Health Score: ${healthScore} (${healthLevel})`)
    
    // ═══════════════════════════════════════════════════════════
    // STEP 7: GUARDAR NA BD
    // ═══════════════════════════════════════════════════════════
    
    const nextUpdate = new Date()
    nextUpdate.setHours(nextUpdate.getHours() + 6)
    
    const calculationDuration = Date.now() - startTime
    
    logger.info('💾 Guardando stats na BD...')
    
    await DashboardStats.deleteMany({ version: 'v3' })
    
    await DashboardStats.create({
      version: 'v3',
      calculatedAt: new Date(),
      overview: {
        totalStudents: uniqueStudents,
        avgEngagement,
        avgProgress,
        activeCount,
        activeRate,
        atRiskCount,
        atRiskRate,
        activeProducts: platformUsers.size,
        healthScore,
        healthLevel,
        healthBreakdown
      },
      byPlatform,
      quickFilters: {
        newStudents: newUsers7d,
        new7d: newUsers7d,
        atRisk: atRiskCount,
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
        uniqueUsers: uniqueStudents
      }
    })
    
    logger.info('\n✅ ========================================')
    logger.info(`✅ Dashboard Stats construídos em ${Math.round(calculationDuration/1000)}s`)
    logger.info(`✅ ${uniqueStudents} alunos únicos processados`)
    logger.info(`✅ Quick Filters:`)
    logger.info(`   🚨 Em Risco: ${atRiskCount} (score < 30)`)
    logger.info(`   🏆 Top 10%: ${topPerformers} (threshold: ${top10Threshold.toFixed(1)})`)
    logger.info(`   😴 Inativos 30d: ${inactiveUsers30d}`)
    logger.info(`   📅 Novos 7d: ${newUsers7d}`)
    logger.info(`✅ Próxima atualização: ${nextUpdate.toLocaleString('pt-PT')}`)
    logger.info('✅ ========================================\n')
    
  } catch (error) {
    logger.error('\n❌ ========================================')
    logger.error('❌ ERRO ao construir Dashboard Stats:', error)
    logger.error('❌ ========================================\n')
    throw error
  }
}

/**
 * 📖 Ler stats do dashboard (RÁPIDO - 50ms)
 */
export async function getDashboardStats() {
  logger.info('📖 [GETTER] Lendo Dashboard Stats da BD...')
  
  const stats = await DashboardStats.findOne({ version: 'v3' }).lean()
  
  if (!stats) {
    logger.warn('⚠️  Dashboard Stats não encontrados! Construindo...')
    await buildDashboardStats()
    return await DashboardStats.findOne({ version: 'v3' }).lean()
  }
  
  // Verificar freshness
  const age = Date.now() - new Date(stats.calculatedAt).getTime()
  const ageHours = age / (1000 * 60 * 60)
  
  if (ageHours > 24) {
    stats.meta.dataFreshness = 'VERY_STALE'
  } else if (ageHours > 12) {
    stats.meta.dataFreshness = 'STALE'
  } else {
    stats.meta.dataFreshness = 'FRESH'
  }
  
  return stats
}
