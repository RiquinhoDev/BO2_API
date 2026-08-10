import type { Platform, Trend } from './core.types'
export interface KPIMetric { value: number; change: number; changePercent: number; trend: Trend; previousValue?: number }
export interface DashboardKPIs {
  totalStudents: KPIMetric; activeStudents: KPIMetric; newStudents: KPIMetric; churnedStudents: KPIMetric
  totalRevenue: KPIMetric; mrr: KPIMetric; arr: KPIMetric; churnRate: KPIMetric
  retentionRate: KPIMetric; growthRate: KPIMetric; avgLTV: KPIMetric; avgOrderValue: KPIMetric; avgEngagement: KPIMetric
}
export interface ProductMetrics {
  productId: string; productName: string; platform: Platform; totalStudents: number; activeStudents: number; newStudents: number
  totalRevenue: number; mrr: number; avgLTV: number; avgOrderValue: number; churnRate: number; retentionRate: number
  growthRate: number; avgEngagement: number; marketShare: number; revenueShare: number; trend: Trend; trendPercent: number
}
export interface ProductComparison { products: ProductMetrics[]; totals: { students: number; revenue: number; avgChurn: number } }
export interface RevenueBreakdownItem { name: string; value: number; percentage: number; color?: string }
export interface RevenueBreakdown {
  byProduct: RevenueBreakdownItem[]; byPlatform: RevenueBreakdownItem[]; bySegment: RevenueBreakdownItem[]
  byPeriod: { period: string; revenue: number; growth: number }[]
}
export interface AcquisitionFunnel { stages: { name: string; count: number; conversionRate: number }[] }
export interface CustomerJourney {
  avgTimeToFirstPurchase: number; avgTimeToSecondPurchase: number; avgTimeToChurn: number
  touchpointsBeforePurchase: number; mostCommonPath: string[]
}
