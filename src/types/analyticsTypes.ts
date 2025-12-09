// ════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS TYPES
// ════════════════════════════════════════════════════════════════════
// Tipos TypeScript para todo o sistema de Analytics V2
// Garante type-safety entre backend e frontend
// ════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type Platform = 'hotmart' | 'curseduca' | 'discord' | 'all'
export type Trend = 'up' | 'down' | 'stable'
export type MetricFormat = 'number' | 'currency' | 'percentage' | 'duration'

// ═══════════════════════════════════════════════════════════════════
// KPI METRICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Métrica individual com comparação vs período anterior
 */
export interface KPIMetric {
  value: number
  change: number            // Diferença absoluta vs período anterior
  changePercent: number     // Diferença % vs período anterior
  trend: Trend              // Direção da mudança
  previousValue?: number    // Valor do período anterior (opcional)
}

/**
 * Conjunto completo de KPIs para o dashboard
 */
export interface DashboardKPIs {
  // Alunos
  totalStudents: KPIMetric
  activeStudents: KPIMetric
  newStudents: KPIMetric
  churnedStudents: KPIMetric
  
  // Receita
  totalRevenue: KPIMetric
  mrr: KPIMetric           // Monthly Recurring Revenue
  arr: KPIMetric           // Annual Recurring Revenue
  
  // Taxas
  churnRate: KPIMetric
  retentionRate: KPIMetric
  growthRate: KPIMetric
  
  // Valores médios
  avgLTV: KPIMetric        // Average Lifetime Value
  avgOrderValue: KPIMetric
  avgEngagement: KPIMetric
}

// ═══════════════════════════════════════════════════════════════════
// TIME SERIES DATA
// ═══════════════════════════════════════════════════════════════════

/**
 * Ponto de dados em série temporal
 */
export interface TimeSeriesDataPoint {
  date: string             // ISO date string
  value: number
  label?: string           // Label customizado (ex: "Jan 2024")
  metadata?: {             // Dados adicionais para tooltip
    [key: string]: any
  }
}

/**
 * Série temporal completa
 */
export interface TimeSeries {
  name: string             // Nome da série (ex: "Total Alunos")
  data: TimeSeriesDataPoint[]
  color?: string           // Cor da linha/barra
  type?: 'line' | 'bar' | 'area'
}

/**
 * Múltiplas séries temporais (para gráficos comparativos)
 */
export interface MultiTimeSeries {
  series: TimeSeries[]
  xAxisLabel?: string
  yAxisLabel?: string
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT METRICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Métricas detalhadas de um produto
 */
export interface ProductMetrics {
  productId: string
  productName: string
  platform: Platform
  
  // Números absolutos
  totalStudents: number
  activeStudents: number
  newStudents: number
  
  // Financeiro
  totalRevenue: number
  mrr: number
  avgLTV: number
  avgOrderValue: number
  
  // Taxas
  churnRate: number
  retentionRate: number
  growthRate: number
  
  // Engagement
  avgEngagement: number
  
  // Market share
  marketShare: number      // % do total de alunos
  revenueShare: number     // % da receita total
  
  // Trend
  trend: Trend
  trendPercent: number
}

/**
 * Comparação entre produtos
 */
export interface ProductComparison {
  products: ProductMetrics[]
  totals: {
    students: number
    revenue: number
    avgChurn: number
  }
}

// ═══════════════════════════════════════════════════════════════════
// COHORT ANALYSIS
// ═══════════════════════════════════════════════════════════════════

/**
 * Dados de retenção de um cohort
 */
export interface CohortRetention {
  month0: number           // 100% (baseline)
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
 * Cohort completo
 */
export interface Cohort {
  cohortDate: string       // YYYY-MM format
  cohortLabel: string      // Display label (ex: "Jan 2024")
  size: number             // Número de alunos no cohort
  retention: CohortRetention
  avgLTV: number
  totalRevenue: number
}

/**
 * Análise completa de cohorts
 */
export interface CohortAnalysis {
  cohorts: Cohort[]
  avgRetention: {          // Retenção média across all cohorts
    month1: number
    month3: number
    month6: number
    month12: number
  }
}

// ═══════════════════════════════════════════════════════════════════
// REVENUE BREAKDOWN
// ═══════════════════════════════════════════════════════════════════

/**
 * Breakdown de receita por dimensão
 */
export interface RevenueBreakdownItem {
  name: string
  value: number
  percentage: number
  color?: string
}

/**
 * Breakdown completo de receita
 */
export interface RevenueBreakdown {
  byProduct: RevenueBreakdownItem[]
  byPlatform: RevenueBreakdownItem[]
  bySegment: RevenueBreakdownItem[]  // New vs Recurring
  byPeriod: {
    period: string
    revenue: number
    growth: number
  }[]
}

// ═══════════════════════════════════════════════════════════════════
// CUSTOMER LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

/**
 * Estágios do funil de aquisição
 */
export interface AcquisitionFunnel {
  stages: {
    name: string           // ex: "Visitantes", "Leads", "Conversões"
    count: number
    conversionRate: number // % que avançou para próximo estágio
  }[]
}

/**
 * Jornada do cliente
 */
export interface CustomerJourney {
  avgTimeToFirstPurchase: number     // dias
  avgTimeToSecondPurchase: number    // dias
  avgTimeToChurn: number             // dias
  touchpointsBeforePurchase: number  // média de interações
  mostCommonPath: string[]           // sequência mais comum
}

// ═══════════════════════════════════════════════════════════════════
// FILTERS & PARAMS
// ═══════════════════════════════════════════════════════════════════

/**
 * Filtros aplicáveis aos dashboards
 */
export interface AnalyticsFilters {
  period: Period
  startDate: string | Date
  endDate: string | Date
  productId?: string | 'all'
  platform?: Platform
  segment?: 'new' | 'recurring' | 'all'
}

/**
 * Parâmetros de query para APIs
 */
export interface AnalyticsQueryParams extends AnalyticsFilters {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// ═══════════════════════════════════════════════════════════════════
// API RESPONSES
// ═══════════════════════════════════════════════════════════════════

/**
 * Response padrão de API de analytics
 */
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

/**
 * Response do endpoint /overview
 */
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

/**
 * Response do endpoint /products/comparison
 */
export interface ProductComparisonResponse {
  comparison: ProductComparison
  timeSeries: MultiTimeSeries
}

/**
 * Response do endpoint /cohorts
 */
export interface CohortAnalysisResponse {
  analysis: CohortAnalysis
  heatmapData: number[][]  // Matriz para heatmap
}

/**
 * Response do endpoint /revenue/breakdown
 */
export interface RevenueBreakdownResponse {
  breakdown: RevenueBreakdown
  forecast: {
    period: string
    predicted: number
    confidence: number
  }[]
}

// ═══════════════════════════════════════════════════════════════════
// CHART CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Configuração de gráfico (para Recharts)
 */
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

/**
 * Props comuns para componentes de gráfico
 */
export interface BaseChartProps {
  data: any[]
  loading?: boolean
  error?: string
  height?: number
  width?: number | string
  className?: string
}

// ═══════════════════════════════════════════════════════════════════
// TABLE DATA
// ═══════════════════════════════════════════════════════════════════

/**
 * Linha da tabela de breakdown detalhado
 */
export interface DetailedBreakdownRow {
  period: string           // "2024-01" ou "Jan 2024"
  newStudents: number
  totalStudents: number
  revenue: number
  churnRate: number
  growthRate: number
  actions?: string         // ID para ações
}

/**
 * Dados completos da tabela
 */
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

// ═══════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════

/**
 * Helper para criar KPIMetric facilmente
 */
export type CreateKPIMetric = (
  current: number,
  previous: number
) => KPIMetric

/**
 * Helper para formatar valores
 */
export interface FormatOptions {
  format: MetricFormat
  decimals?: number
  currency?: string
  locale?: string
}

// ════════════════════════════════════════════════════════════════════
// NOTAS DE USO:
// ════════════════════════════════════════════════════════════════════
//
// 1. IMPORTAÇÃO:
//    import { KPIMetric, TimeSeries, ... } from '@/types/analyticsTypes'
//
// 2. TYPE SAFETY:
//    - Backend e Frontend compartilham mesma definição
//    - Evita bugs de tipo mismatch
//    - Autocomplete no IDE
//
// 3. EXTENSIBILIDADE:
//    - Fácil adicionar novos tipos/métricas
//    - Backward compatible
//
// 4. CONVENÇÕES:
//    - Interfaces para objetos complexos
//    - Types para aliases simples
//    - Enums para valores fixos
//
// ════════════════════════════════════════════════════════════════════