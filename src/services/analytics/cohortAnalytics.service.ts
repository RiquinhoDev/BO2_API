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
    const startDate = filters.startDate ? moment(filters.startDate) : moment().subtract(12, 'months')
    const endDate = filters.endDate ? moment(filters.endDate) : moment()
    const match: Record<string, unknown> = {
      enrolledAt: {
        $gte: startDate.clone().startOf('month').toDate(),
        $lt: endDate.clone().add(1, 'month').startOf('month').toDate()
      },
      status: { $ne: 'CANCELLED' }
    }
    if (filters.productId) match.productId = filters.productId
    if (filters.platform) match.platform = filters.platform

    const milestones = [1, 2, 3, 6, 12]
    const activeAt = (monthsAhead: number) => ({
      $sum: {
        $cond: [
          {
            $or: [
              { $eq: ['$status', 'ACTIVE'] },
              { $gte: ['$engagement.lastLogin', { $dateAdd: { startDate: '$cohortStart', unit: 'month', amount: monthsAhead } }] },
              { $gte: ['$engagement.lastAction', { $dateAdd: { startDate: '$cohortStart', unit: 'month', amount: monthsAhead } }] }
            ]
          },
          1,
          0
        ]
      }
    })

    const rows = await UserProduct.aggregate([
      { $match: match },
      { $set: { cohortStart: { $dateTrunc: { date: '$enrolledAt', unit: 'month' } } } },
      {
        $group: {
          _id: '$cohortStart',
          initialSize: { $sum: 1 },
          month1: activeAt(1),
          month2: activeAt(2),
          month3: activeAt(3),
          month6: activeAt(6),
          month12: activeAt(12)
        }
      },
      { $sort: { _id: -1 } }
    ]).allowDiskUse(true)

    return rows.map(row => {
      const cohortDate = moment(row._id)
      const retention: CohortRetentionData['retention'] = { month0: 100 }
      const absoluteCounts: CohortRetentionData['absoluteCounts'] = { month0: row.initialSize }
      for (const monthsAhead of milestones) {
        if (cohortDate.clone().add(monthsAhead, 'months').isAfter(moment())) break
        const count = row['month' + monthsAhead]
        if (monthsAhead === 1) { retention.month1 = Math.round((count / row.initialSize) * 100); absoluteCounts.month1 = count }
        if (monthsAhead === 2) { retention.month2 = Math.round((count / row.initialSize) * 100); absoluteCounts.month2 = count }
        if (monthsAhead === 3) { retention.month3 = Math.round((count / row.initialSize) * 100); absoluteCounts.month3 = count }
        if (monthsAhead === 6) { retention.month6 = Math.round((count / row.initialSize) * 100); absoluteCounts.month6 = count }
        if (monthsAhead === 12) { retention.month12 = Math.round((count / row.initialSize) * 100); absoluteCounts.month12 = count }
      }
      return {
        cohortMonth: cohortDate.format('YYYY-MM'),
        cohortLabel: cohortDate.format('MMM YYYY'),
        initialSize: row.initialSize,
        retention,
        absoluteCounts
      }
    })
  }
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
    ]).allowDiskUse(true)
    
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