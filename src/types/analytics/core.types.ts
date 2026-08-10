export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type Platform = 'hotmart' | 'curseduca' | 'discord' | 'all'
export type Trend = 'up' | 'down' | 'stable'
export type MetricFormat = 'number' | 'currency' | 'percentage' | 'duration'
export type TimeSeriesInterval = 'day' | 'week' | 'month' | 'year'

export interface CacheOptions {
  productId?: string | null
  platform?: Platform | null
  period: Period
  startDate: Date
  endDate: Date
  forceRefresh?: boolean
}

export interface CacheConfig { daily: number; weekly: number; monthly: number; yearly: number }
export interface KPIComparison { value: number; change: number; changePercent: number }

export interface CacheMetrics {
  totalStudents: number
  activeStudents: number
  newStudents: number
  churnedStudents: number
  totalRevenue: number
  mrr: number
  arr: number
  churnRate: number
  retentionRate: number
  growthRate: number
  avgLTV: number
  avgOrderValue: number
  avgEngagement: number
  comparison: {
    totalStudents: KPIComparison
    revenue: KPIComparison
    churnRate: KPIComparison
    growthRate: KPIComparison
  }
}

export interface CalculateMetricsOptions {
  productId?: string | null
  platform?: Exclude<Platform, 'all'> | null
  startDate: Date
  endDate: Date
  compareWithPrevious?: boolean
}

export interface TimeSeriesDataPoint {
  date: string
  value: number
  label?: string
  metadata?: Record<string, any>
}

export interface TimeSeries {
  name: string
  data: TimeSeriesDataPoint[]
  color?: string
  type?: 'line' | 'bar' | 'area'
}

export interface MultiTimeSeries { series: TimeSeries[]; xAxisLabel?: string; yAxisLabel?: string }
export interface TimeSeriesPoint { date: string; value: number; label: string }
