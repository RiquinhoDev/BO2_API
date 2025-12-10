// ════════════════════════════════════════════════════════════
// 📊 COHORT ANALYSIS TYPES
// ════════════════════════════════════════════════════════════

export interface CohortRetentionData {
  cohortMonth: string              // "2024-01"
  cohortLabel: string              // "Jan 2024"
  initialSize: number              // 245
  
  // Retenção mês a mês
  retention: {
    month0: number                 // 100% (sempre)
    month1?: number                // 85%
    month2?: number                // 72%
    month3?: number                // 65%
    month6?: number                // 45%
    month12?: number               // 30%
  }
  
  // Counts absolutos
  absoluteCounts: {
    month0: number                 // 245
    month1?: number                // 208
    month2?: number                // 176
    month3?: number                // 159
    month6?: number                // 110
    month12?: number               // 73
  }
}

export interface CohortMetrics {
  cohortMonth: string
  cohortLabel: string
  initialSize: number
  currentActive: number
  retentionRate: number            // %
  
  // Revenue
  totalRevenue: number
  avgRevenuePerUser: number
  
  // Progress
  avgProgress: number
  completionRate: number
  
  // Engagement
  avgEngagement: number
}

export interface CohortAnalysisResponse {
  success: boolean
  data: {
    heatmapData: CohortRetentionData[]
    selectedCohortMetrics?: CohortMetrics
    summary: {
      totalCohorts: number
      overallRetentionMonth3: number
      overallRetentionMonth6: number
      bestPerformingCohort: string
      worstPerformingCohort: string
    }
  }
}

export interface CohortAnalysisFilters {
  productId?: string
  platform?: string
  startDate?: string               // "2024-01-01"
  endDate?: string                 // "2024-12-31"
  selectedCohort?: string          // "2024-01"
}