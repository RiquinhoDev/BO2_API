import type { Platform } from './core.types'
export interface CohortRetention {
  month0: number; month1?: number; month2?: number; month3?: number; month4?: number; month5?: number; month6?: number
  month7?: number; month8?: number; month9?: number; month10?: number; month11?: number; month12?: number
}
export interface Cohort { cohortDate: string; cohortLabel: string; size: number; retention: CohortRetention; avgLTV: number; totalRevenue: number }
export interface CohortAnalysis { cohorts: Cohort[]; avgRetention: { month1: number; month3: number; month6: number; month12: number } }
export interface CohortAnalysisFilters { startDate?: Date; endDate?: Date; productId?: string; platform?: Exclude<Platform, 'all'> }
export interface CohortRetentionData {
  cohortMonth: string; cohortLabel: string; initialSize: number; retention: Record<string, number>; absoluteCounts: Record<string, number>
}
export interface CohortMetrics {
  cohortMonth: string; cohortLabel: string; initialSize: number; currentActive: number; retentionRate: number
  totalRevenue: number; avgRevenuePerUser: number; avgProgress: number; completionRate: number; avgEngagement: number
}
