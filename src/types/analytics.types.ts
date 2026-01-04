// ════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS TYPES (UNIFICADO)
// ════════════════════════════════════════════════════════════════════
// Tipos TypeScript para todo o sistema de Analytics V2
// Garante type-safety entre backend e frontend
// ════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// Shared primitives / Enums
// ──────────────────────────────────────────────────────────────

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * NOTA:
 * - No frontend pode fazer sentido existir 'all'
 * - No backend (queries) normalmente usas null/undefined para "sem filtro"
 * Mantemos aqui para ambos, para não rebentar imports.
 */
export type Platform = 'hotmart' | 'curseduca' | 'discord' | 'all'

export type Trend = 'up' | 'down' | 'stable'
export type MetricFormat = 'number' | 'currency' | 'percentage' | 'duration'

// ──────────────────────────────────────────────────────────────
// KPI Metrics (dashboard)
// ──────────────────────────────────────────────────────────────

export interface KPIMetric {
  value: number
  change: number
  changePercent: number
  trend: Trend
  previousValue?: number
}

export interface DashboardKPIs {
  // Alunos
  totalStudents: KPIMetric
  activeStudents: KPIMetric
  newStudents: KPIMetric
  churnedStudents: KPIMetric

  // Receita
  totalRevenue: KPIMetric
  mrr: KPIMetric
  arr: KPIMetric

  // Taxas
  churnRate: KPIMetric
  retentionRate: KPIMetric
  growthRate: KPIMetric

  // Valores médios
  avgLTV: KPIMetric
  avgOrderValue: KPIMetric
  avgEngagement: KPIMetric
}

// ──────────────────────────────────────────────────────────────
// Cache Service (backend) - sem conflitos
// ──────────────────────────────────────────────────────────────

export interface CacheOptions {
  productId?: string | null
  /**
   * Para compatibilidade:
   * - 'all' no frontend equivale a null/undefined no backend
   */
  platform?: Platform | null
  period: Period
  startDate: Date
  endDate: Date
  forceRefresh?: boolean
}

export interface CacheConfig {
  daily: number
  weekly: number
  monthly: number
  yearly: number
}

/**
 * comparação simplificada (para cache numérico)
 */
export interface KPIComparison {
  value: number
  change: number
  changePercent: number
}

/**
 * Métricas cacheadas em formato numérico (já “flattened”)
 * (para responder rápido sem carregar KPIMetric completo)
 */
export interface CacheMetrics {
  // KPIs Principais
  totalStudents: number
  activeStudents: number
  newStudents: number
  churnedStudents: number

  // Receita
  totalRevenue: number
  mrr: number
  arr: number

  // Taxas
  churnRate: number
  retentionRate: number
  growthRate: number

  // Valores Médios
  avgLTV: number
  avgOrderValue: number

  // Engagement
  avgEngagement: number

  // Comparação com período anterior
  comparison: {
    totalStudents: KPIComparison
    revenue: KPIComparison
    churnRate: KPIComparison
    growthRate: KPIComparison
  }
}

// ──────────────────────────────────────────────────────────────
// Calculator Service (backend)
// ──────────────────────────────────────────────────────────────

export interface CalculateMetricsOptions {
  productId?: string | null
  platform?: Exclude<Platform, 'all'> | null
  startDate: Date
  endDate: Date
  compareWithPrevious?: boolean
}

export type TimeSeriesInterval = 'day' | 'week' | 'month' | 'year'

// ──────────────────────────────────────────────────────────────
// Time Series (frontend/back)
// ──────────────────────────────────────────────────────────────

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

export interface MultiTimeSeries {
  series: TimeSeries[]
  xAxisLabel?: string
  yAxisLabel?: string
}

// Se quiseres manter o tipo usado no calculator antigo:
export interface TimeSeriesPoint {
  date: string
  value: number
  label: string
}

// ──────────────────────────────────────────────────────────────
// Product Metrics
// ──────────────────────────────────────────────────────────────

export interface ProductMetrics {
  productId: string
  productName: string
  platform: Platform

  totalStudents: number
  activeStudents: number
  newStudents: number

  totalRevenue: number
  mrr: number
  avgLTV: number
  avgOrderValue: number

  churnRate: number
  retentionRate: number
  growthRate: number

  avgEngagement: number

  marketShare: number
  revenueShare: number

  trend: Trend
  trendPercent: number
}

export interface ProductComparison {
  products: ProductMetrics[]
  totals: {
    students: number
    revenue: number
    avgChurn: number
  }
}

// ──────────────────────────────────────────────────────────────
// Cohort Analysis (frontend/back)
// ──────────────────────────────────────────────────────────────

export interface CohortRetention {
  month0: number
  month1?: number
  month2?: number
  month3?: number
  month4?: number
  month5?: number
  month6?: number
  month7?: number
  month8?: number
  month9?: number
  month10?: number
  month11?: number
  month12?: number
}

/**
 * Cohort “UI friendly”
 */
export interface Cohort {
  cohortDate: string
  cohortLabel: string
  size: number
  retention: CohortRetention
  avgLTV: number
  totalRevenue: number
}

export interface CohortAnalysis {
  cohorts: Cohort[]
  avgRetention: {
    month1: number
    month3: number
    month6: number
    month12: number
  }
}

/**
 * Cohort “backend friendly” (como no teu serviço atual)
 * Mantido para não partir o cohortAnalytics.service.ts
 */
export interface CohortAnalysisFilters {
  startDate?: Date
  endDate?: Date
  productId?: string
  platform?: Exclude<Platform, 'all'>
}

export interface CohortRetentionData {
  cohortMonth: string
  cohortLabel: string
  initialSize: number
  retention: Record<string, number>
  absoluteCounts: Record<string, number>
}

export interface CohortMetrics {
  cohortMonth: string
  cohortLabel: string
  initialSize: number
  currentActive: number
  retentionRate: number
  totalRevenue: number
  avgRevenuePerUser: number
  avgProgress: number
  completionRate: number
  avgEngagement: number
}

// ──────────────────────────────────────────────────────────────
// Revenue Breakdown
// ──────────────────────────────────────────────────────────────

export interface RevenueBreakdownItem {
  name: string
  value: number
  percentage: number
  color?: string
}

export interface RevenueBreakdown {
  byProduct: RevenueBreakdownItem[]
  byPlatform: RevenueBreakdownItem[]
  bySegment: RevenueBreakdownItem[]
  byPeriod: {
    period: string
    revenue: number
    growth: number
  }[]
}

// ──────────────────────────────────────────────────────────────
// Customer Lifecycle
// ──────────────────────────────────────────────────────────────

export interface AcquisitionFunnel {
  stages: {
    name: string
    count: number
    conversionRate: number
  }[]
}

export interface CustomerJourney {
  avgTimeToFirstPurchase: number
  avgTimeToSecondPurchase: number
  avgTimeToChurn: number
  touchpointsBeforePurchase: number
  mostCommonPath: string[]
}

// ──────────────────────────────────────────────────────────────
// Filters & Params
// ──────────────────────────────────────────────────────────────

export interface AnalyticsFilters {
  period: Period
  startDate: string | Date
  endDate: string | Date
  productId?: string | 'all'
  platform?: Platform
  segment?: 'new' | 'recurring' | 'all'
}

export interface AnalyticsQueryParams extends AnalyticsFilters {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// ──────────────────────────────────────────────────────────────
// API Responses
// ──────────────────────────────────────────────────────────────

export interface AnalyticsResponse<T> {
  success: boolean
  data: T
  meta?: {
    calculatedAt: string
    durationMs: number
    cached: boolean
    version: string
  }
  error?: string
}

export interface OverviewResponse {
  kpis: DashboardKPIs
  timeSeries: {
    cumulativeStudents: TimeSeries
    newStudents: TimeSeries
    revenue: TimeSeries
    churn: TimeSeries
  }
  breakdown: {
    byProduct: ProductMetrics[]
    byPlatform: RevenueBreakdownItem[]
  }
}

export interface ProductComparisonResponse {
  comparison: ProductComparison
  timeSeries: MultiTimeSeries
}

export interface CohortAnalysisResponse {
  analysis: CohortAnalysis
  heatmapData: number[][]
}

export interface RevenueBreakdownResponse {
  breakdown: RevenueBreakdown
  forecast: {
    period: string
    predicted: number
    confidence: number
  }[]
}

// ──────────────────────────────────────────────────────────────
// Charts / Tables
// ──────────────────────────────────────────────────────────────

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'heatmap'
  data: any[]
  xKey: string
  yKey: string | string[]
  colors?: string[]
  legend?: boolean
  tooltip?: boolean
  grid?: boolean
  responsive?: boolean
}

export interface BaseChartProps {
  data: any[]
  loading?: boolean
  error?: string
  height?: number
  width?: number | string
  className?: string
}

export interface DetailedBreakdownRow {
  period: string
  newStudents: number
  totalStudents: number
  revenue: number
  churnRate: number
  growthRate: number
  actions?: string
}

export interface DetailedBreakdownTable {
  rows: DetailedBreakdownRow[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  summary: {
    totalNewStudents: number
    totalRevenue: number
    avgChurnRate: number
    avgGrowthRate: number
  }
}

// ──────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────

export type CreateKPIMetric = (current: number, previous: number) => KPIMetric

export interface FormatOptions {
  format: MetricFormat
  decimals?: number
  currency?: string
  locale?: string
}

// ──────────────────────────────────────────────────────────────
// Class Analytics (backend)
// ──────────────────────────────────────────────────────────────

export type AlertType = 'warning' | 'info' | 'success'
export type AlertPriority = 'high' | 'medium' | 'low'

export interface ClassAnalyticsAlert {
  type: AlertType
  message: string
  priority: AlertPriority
  category: string
}

export interface EngagementDistribution {
  muito_alto: number
  alto: number
  medio: number
  baixo: number
  muito_baixo: number
}

export interface ProgressDistribution {
  completed: number
  advanced: number
  intermediate: number
  beginner: number
  minimal: number
}

export interface ActivityDistribution {
  very_active: number
  active: number
  moderate: number
  low: number
  inactive: number
}

export interface LastAccessStats {
  today: number
  week: number
  month: number
  older: number
}

export interface HealthFactors {
  engagement: number
  activity: number
  progress: number
  retention: number
}

export interface IClassAnalytics {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  inactiveStudents: number
  averageEngagement: number
  engagementDistribution: EngagementDistribution
  averageProgress: number
  progressDistribution: ProgressDistribution
  averageAccessCount: number
  activityDistribution: ActivityDistribution
  lastAccess: LastAccessStats
  healthScore: number
  healthFactors: HealthFactors
  alerts: ClassAnalyticsAlert[]
  lastCalculatedAt: Date
  calculationDuration: number
  studentsProcessed: number
  dataVersion: string
}
