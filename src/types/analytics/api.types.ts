import type { CohortAnalysis } from './cohort.types'
import type { MultiTimeSeries, Period, Platform, TimeSeries } from './core.types'
import type { DashboardKPIs, ProductComparison, ProductMetrics, RevenueBreakdown, RevenueBreakdownItem } from './dashboard.types'
export interface AnalyticsFilters {
  period: Period; startDate: string | Date; endDate: string | Date; productId?: string | 'all'; platform?: Platform
  segment?: 'new' | 'recurring' | 'all'
}
export interface AnalyticsQueryParams extends AnalyticsFilters { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
export interface AnalyticsResponse<T> {
  success: boolean; data: T
  meta?: { calculatedAt: string; durationMs: number; cached: boolean; version: string }
  error?: string
}
export interface OverviewResponse {
  kpis: DashboardKPIs
  timeSeries: { cumulativeStudents: TimeSeries; newStudents: TimeSeries; revenue: TimeSeries; churn: TimeSeries }
  breakdown: { byProduct: ProductMetrics[]; byPlatform: RevenueBreakdownItem[] }
}
export interface ProductComparisonResponse { comparison: ProductComparison; timeSeries: MultiTimeSeries }
export interface CohortAnalysisResponse { analysis: CohortAnalysis; heatmapData: number[][] }
export interface RevenueBreakdownResponse { breakdown: RevenueBreakdown; forecast: { period: string; predicted: number; confidence: number }[] }
