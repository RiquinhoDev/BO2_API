// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYTICS SERVICE
// ════════════════════════════════════════════════════════════

import UserProduct from '../../models/UserProduct'
import { 
  CohortRetentionData, 
  CohortMetrics, 
  CohortAnalysisFilters 
} from '../../types/cohortTypes'
import moment from 'moment'

class CohortAnalyticsService {
  
  // ─────────────────────────────────────────────────────────
  // CALCULAR COHORT RETENTION HEATMAP
  // ─────────────────────────────────────────────────────────
  
  async calculateCohortRetention(
    filters: CohortAnalysisFilters
  ): Promise<CohortRetentionData[]> {
    
    // 1. Definir range de cohorts
    const startDate = filters.startDate 
      ? moment(filters.startDate) 
      : moment().subtract(12, 'months')
    
    const endDate = filters.endDate 
      ? moment(filters.endDate) 
      : moment()
    
    const cohorts: CohortRetentionData[] = []
    
    // 2. Iterar por cada mês
    let currentCohort = startDate.clone().startOf('month')
    
    while (currentCohort.isSameOrBefore(endDate)) {
      const cohortMonth = currentCohort.format('YYYY-MM')
      const cohortLabel = currentCohort.format('MMM YYYY')
      
      // 3. Query base para este cohort
      const baseQuery: any = {
        enrolledAt: {
          $gte: currentCohort.toDate(),
          $lt: currentCohort.clone().add(1, 'month').toDate()
        },
        status: { $ne: 'CANCELLED' }
      }
      
      // Aplicar filtros adicionais
      if (filters.productId) {
        baseQuery.productId = filters.productId
      }
      if (filters.platform) {
        baseQuery.platform = filters.platform
      }
      
      // 4. Contar initial size
      const initialSize = await UserProduct.countDocuments(baseQuery)
      
      if (initialSize === 0) {
        currentCohort.add(1, 'month')
        continue
      }
      
      // 5. Calcular retenção para cada milestone
      const retention: any = { month0: 100 }
      const absoluteCounts: any = { month0: initialSize }
      
      const milestones = [1, 2, 3, 6, 12]
      
      for (const monthsAhead of milestones) {
        const milestoneDate = currentCohort.clone().add(monthsAhead, 'months')
        
        // Só calcular se milestone já passou
        if (milestoneDate.isAfter(moment())) {
          break
        }
        
        // Query: users ainda ativos nesse mês
        const activeQuery = {
          ...baseQuery,
          $or: [
            // Ainda ativo
            { status: 'ACTIVE' },
            // Ou teve atividade recente
            { 'engagement.lastLogin': { $gte: milestoneDate.toDate() } },
            { 'engagement.lastAction': { $gte: milestoneDate.toDate() } }
          ]
        }
        
        const activeCount = await UserProduct.countDocuments(activeQuery)
        const retentionPct = (activeCount / initialSize) * 100
        
        retention[`month${monthsAhead}`] = Math.round(retentionPct)
        absoluteCounts[`month${monthsAhead}`] = activeCount
      }
      
      // 6. Adicionar cohort aos resultados
      cohorts.push({
        cohortMonth,
        cohortLabel,
        initialSize,
        retention,
        absoluteCounts
      })
      
      currentCohort.add(1, 'month')
    }
    
    return cohorts.reverse() // Mais recente primeiro
  }
  
  // ─────────────────────────────────────────────────────────
  // CALCULAR MÉTRICAS DE UM COHORT ESPECÍFICO
  // ─────────────────────────────────────────────────────────
  
  async calculateCohortMetrics(
    cohortMonth: string,
    filters: CohortAnalysisFilters
  ): Promise<CohortMetrics> {
    
    const cohortDate = moment(cohortMonth, 'YYYY-MM')
    
    // Query para este cohort
    const query: any = {
      enrolledAt: {
        $gte: cohortDate.toDate(),
        $lt: cohortDate.clone().add(1, 'month').toDate()
      }
    }
    
    if (filters.productId) query.productId = filters.productId
    if (filters.platform) query.platform = filters.platform
    
    // Aggregate para calcular métricas
    const result = await UserProduct.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          initialSize: { $sum: 1 },
          currentActive: {
            $sum: {
              $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0]
            }
          },
          totalRevenue: {
            $sum: { $ifNull: ['$metadata.purchaseValue', 0] }
          },
          avgProgress: {
            $avg: { $ifNull: ['$progress.percentage', 0] }
          },
          completedCount: {
            $sum: {
              $cond: [
                { $gte: ['$progress.percentage', 100] },
                1,
                0
              ]
            }
          },
          avgEngagement: {
            $avg: { $ifNull: ['$engagement.engagementScore', 0] }
          }
        }
      }
    ])
    
    if (result.length === 0) {
      throw new Error(`Cohort ${cohortMonth} not found`)
    }
    
    const data = result[0]
    
    return {
      cohortMonth,
      cohortLabel: cohortDate.format('MMM YYYY'),
      initialSize: data.initialSize,
      currentActive: data.currentActive,
      retentionRate: (data.currentActive / data.initialSize) * 100,
      totalRevenue: data.totalRevenue,
      avgRevenuePerUser: data.totalRevenue / data.initialSize,
      avgProgress: data.avgProgress,
      completionRate: (data.completedCount / data.initialSize) * 100,
      avgEngagement: data.avgEngagement
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // CALCULAR SUMMARY STATS
  // ─────────────────────────────────────────────────────────
  
  async calculateSummary(
    cohorts: CohortRetentionData[]
  ) {
    if (cohorts.length === 0) {
      return {
        totalCohorts: 0,
        overallRetentionMonth3: 0,
        overallRetentionMonth6: 0,
        bestPerformingCohort: 'N/A',
        worstPerformingCohort: 'N/A'
      }
    }
    
    // Overall retention (média de todos os cohorts)
    const validMonth3 = cohorts.filter(c => c.retention.month3 !== undefined)
    const overallRetentionMonth3 = validMonth3.length > 0
      ? validMonth3.reduce((sum, c) => sum + c.retention.month3!, 0) / validMonth3.length
      : 0
    
    const validMonth6 = cohorts.filter(c => c.retention.month6 !== undefined)
    const overallRetentionMonth6 = validMonth6.length > 0
      ? validMonth6.reduce((sum, c) => sum + c.retention.month6!, 0) / validMonth6.length
      : 0
    
    // Best/Worst performing (baseado em month3)
    let bestCohort = validMonth3[0]
    let worstCohort = validMonth3[0]
    
    validMonth3.forEach(cohort => {
      if (cohort.retention.month3! > (bestCohort?.retention.month3 || 0)) {
        bestCohort = cohort
      }
      if (cohort.retention.month3! < (worstCohort?.retention.month3 || 100)) {
        worstCohort = cohort
      }
    })
    
    return {
      totalCohorts: cohorts.length,
      overallRetentionMonth3: Math.round(overallRetentionMonth3),
      overallRetentionMonth6: Math.round(overallRetentionMonth6),
      bestPerformingCohort: bestCohort?.cohortLabel || 'N/A',
      worstPerformingCohort: worstCohort?.cohortLabel || 'N/A'
    }
  }
}

export default new CohortAnalyticsService()