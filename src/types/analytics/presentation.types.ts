import type { MetricFormat } from './core.types'
import type { KPIMetric } from './dashboard.types'
export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'heatmap'; data: unknown[]; xKey: string; yKey: string | string[]
  colors?: string[]; legend?: boolean; tooltip?: boolean; grid?: boolean; responsive?: boolean
}
export interface BaseChartProps { data: unknown[]; loading?: boolean; error?: string; height?: number; width?: number | string; className?: string }
export interface DetailedBreakdownRow {
  period: string; newStudents: number; totalStudents: number; revenue: number; churnRate: number; growthRate: number; actions?: string
}
export interface DetailedBreakdownTable {
  rows: DetailedBreakdownRow[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
  summary: { totalNewStudents: number; totalRevenue: number; avgChurnRate: number; avgGrowthRate: number }
}
export type CreateKPIMetric = (current: number, previous: number) => KPIMetric
export interface FormatOptions { format: MetricFormat; decimals?: number; currency?: string; locale?: string }
