// ════════════════════════════════════════════════════════════════════
// 📊 ANALYTICS CALCULATOR SERVICE
// ════════════════════════════════════════════════════════════════════
// Serviço central para cálculo de todas as métricas de analytics
// Responsável por processar dados brutos e gerar insights
// ════════════════════════════════════════════════════════════════════

import UserProduct from '../models/UserProduct'
import User from '../models/user'
import Product from '../models/Product'
import { Types } from 'mongoose'

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

interface DateRange {
  start: Date
  end: Date
}

interface CalculateMetricsOptions {
  productId?: string | null
  platform?: 'hotmart' | 'curseduca' | 'discord' | null
  startDate: Date
  endDate: Date
  compareWithPrevious?: boolean
}

interface KPIMetric {
  value: number
  change: number
  changePercent: number
  trend: 'up' | 'down' | 'stable'
  previousValue?: number
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS CALCULATOR SERVICE
// ═══════════════════════════════════════════════════════════════════

class AnalyticsCalculatorService {
  
  // ═════════════════════════════════════════════════════════════════
  // MAIN PUBLIC METHOD: Calculate All Metrics
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Calcula todas as métricas para um período
   */
  async calculateMetrics(options: CalculateMetricsOptions) {
    console.log('🧮 [Analytics Calculator] Iniciando cálculo de métricas...')
    const startTime = Date.now()
    
    const {
      productId,
      platform,
      startDate,
      endDate,
      compareWithPrevious = true
    } = options
    
    // Construir query base
    const query: any = {
      enrolledAt: { $gte: startDate, $lte: endDate }
    }
    
    if (productId) query.productId = productId
    if (platform) query.platform = platform
    
    // Buscar UserProducts do período
    const currentPeriodUPs = await UserProduct.find(query)
      .populate('userId', 'name email')
      .populate('productId', 'name platform')
      .lean()
    
    console.log(`   📊 ${currentPeriodUPs.length} UserProducts no período atual`)
    
    // Buscar UserProducts do período anterior (para comparação)
    let previousPeriodUPs: any[] = []
    if (compareWithPrevious) {
      const periodDuration = endDate.getTime() - startDate.getTime()
      const previousStartDate = new Date(startDate.getTime() - periodDuration)
      const previousEndDate = new Date(startDate.getTime() - 1) // 1ms antes do start atual
      
      const previousQuery = {
        ...query,
        enrolledAt: { $gte: previousStartDate, $lte: previousEndDate }
      }
      
      previousPeriodUPs = await UserProduct.find(previousQuery).lean()
      console.log(`   📊 ${previousPeriodUPs.length} UserProducts no período anterior`)
    }
    
    // Calcular métricas
    const metrics = {
      // KPIs Principais
      totalStudents: await this.calculateTotalStudents(currentPeriodUPs, previousPeriodUPs),
      activeStudents: await this.calculateActiveStudents(currentPeriodUPs, previousPeriodUPs),
      newStudents: await this.calculateNewStudents(currentPeriodUPs, previousPeriodUPs),
      churnedStudents: await this.calculateChurnedStudents(startDate, endDate, previousPeriodUPs),
      
      // Receita
      totalRevenue: await this.calculateRevenue(currentPeriodUPs, previousPeriodUPs),
      mrr: await this.calculateMRR(currentPeriodUPs, previousPeriodUPs),
      arr: await this.calculateARR(currentPeriodUPs, previousPeriodUPs),
      
      // Taxas
      churnRate: await this.calculateChurnRate(currentPeriodUPs, previousPeriodUPs, startDate, endDate),
      retentionRate: await this.calculateRetentionRate(currentPeriodUPs, previousPeriodUPs),
      growthRate: await this.calculateGrowthRate(currentPeriodUPs, previousPeriodUPs),
      
      // Valores Médios
      avgLTV: await this.calculateAvgLTV(currentPeriodUPs, previousPeriodUPs),
      avgOrderValue: await this.calculateAvgOrderValue(currentPeriodUPs, previousPeriodUPs),
      avgEngagement: await this.calculateAvgEngagement(currentPeriodUPs, previousPeriodUPs)
    }
    
    const duration = Date.now() - startTime
    console.log(`✅ [Analytics Calculator] Métricas calculadas em ${duration}ms`)
    
    return metrics
  }
  
  // ═════════════════════════════════════════════════════════════════
  // STUDENT METRICS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Total de alunos únicos
   */
  private async calculateTotalStudents(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // Contar users únicos (não UserProducts)
    const currentUserIds = new Set(
      currentUPs.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    const previousUserIds = new Set(
      previousUPs.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    const current = currentUserIds.size
    const previous = previousUserIds.size
    
    return this.createKPIMetric(current, previous)
  }
  
  /**
   * Alunos ativos (status ACTIVE)
   */
  private async calculateActiveStudents(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    const currentActive = currentUPs.filter(up => up.status === 'ACTIVE')
    const previousActive = previousUPs.filter(up => up.status === 'ACTIVE')
    
    const currentUserIds = new Set(
      currentActive.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    const previousUserIds = new Set(
      previousActive.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    return this.createKPIMetric(currentUserIds.size, previousUserIds.size)
  }
  
  /**
   * Novos alunos (primeira compra no período)
   */
  private async calculateNewStudents(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // Lógica: User é "novo" se não tinha nenhum UP antes
    // TODO: Implementar lógica mais sofisticada considerando primeira compra
    
    const current = currentUPs.length
    const previous = previousUPs.length
    
    return this.createKPIMetric(current, previous)
  }
  
  /**
   * Alunos que saíram (churn)
   */
  private async calculateChurnedStudents(
    startDate: Date,
    endDate: Date,
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // Buscar users que tinham status ACTIVE mas mudaram para INACTIVE/CANCELLED
    const churnedUPs = await UserProduct.find({
      updatedAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['INACTIVE', 'CANCELLED'] }
    }).lean()
    
    const previousChurnedUPs = previousUPs.filter(up => 
      ['INACTIVE', 'CANCELLED'].includes(up.status)
    )
    
    const currentUserIds = new Set(
      churnedUPs.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    const previousUserIds = new Set(
      previousChurnedUPs.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
    )
    
    return this.createKPIMetric(currentUserIds.size, previousUserIds.size)
  }
  
  // ═════════════════════════════════════════════════════════════════
  // REVENUE METRICS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Receita total
   */
  private async calculateRevenue(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // TODO: Adicionar campo 'price' ao UserProduct
    // Por agora, estimar baseado em produto médio
    
    const AVERAGE_PRODUCT_PRICE = 500 // R$ 500 por produto (placeholder)
    
    const current = currentUPs.length * AVERAGE_PRODUCT_PRICE
    const previous = previousUPs.length * AVERAGE_PRODUCT_PRICE
    
    return this.createKPIMetric(current, previous)
  }
  
  /**
   * MRR - Monthly Recurring Revenue
   */
  private async calculateMRR(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // MRR = Alunos ativos × Preço médio mensal
    const activeUPs = currentUPs.filter(up => up.status === 'ACTIVE')
    const previousActiveUPs = previousUPs.filter(up => up.status === 'ACTIVE')
    
    const MONTHLY_PRICE = 50 // R$ 50/mês (placeholder)
    
    const current = activeUPs.length * MONTHLY_PRICE
    const previous = previousActiveUPs.length * MONTHLY_PRICE
    
    return this.createKPIMetric(current, previous)
  }
  
  /**
   * ARR - Annual Recurring Revenue
   */
  private async calculateARR(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    const mrr = await this.calculateMRR(currentUPs, previousUPs)
    
    return {
      value: mrr.value * 12,
      change: mrr.change * 12,
      changePercent: mrr.changePercent,
      trend: mrr.trend,
      previousValue: mrr.previousValue ? mrr.previousValue * 12 : undefined
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // RATE METRICS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Churn Rate (% de alunos que saíram)
   */
  private async calculateChurnRate(
    currentUPs: any[],
    previousUPs: any[],
    startDate: Date,
    endDate: Date
  ): Promise<KPIMetric> {
    const churnedStudents = await this.calculateChurnedStudents(startDate, endDate, previousUPs)
    const totalStudents = await this.calculateTotalStudents(currentUPs, previousUPs)
    
    const currentRate = totalStudents.value > 0 
      ? (churnedStudents.value / totalStudents.value) * 100 
      : 0
    
    const previousRate = totalStudents.previousValue && totalStudents.previousValue > 0
      ? (churnedStudents.previousValue || 0) / totalStudents.previousValue * 100
      : 0
    
    return this.createKPIMetric(currentRate, previousRate)
  }
  
  /**
   * Retention Rate (% de alunos que ficaram)
   */
  private async calculateRetentionRate(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    const activeUPs = currentUPs.filter(up => up.status === 'ACTIVE')
    const previousActiveUPs = previousUPs.filter(up => up.status === 'ACTIVE')
    
    const currentRate = currentUPs.length > 0
      ? (activeUPs.length / currentUPs.length) * 100
      : 0
    
    const previousRate = previousUPs.length > 0
      ? (previousActiveUPs.length / previousUPs.length) * 100
      : 0
    
    return this.createKPIMetric(currentRate, previousRate)
  }
  
  /**
   * Growth Rate (% de crescimento)
   */
  private async calculateGrowthRate(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    const current = currentUPs.length
    const previous = previousUPs.length
    
    const growthRate = previous > 0
      ? ((current - previous) / previous) * 100
      : 0
    
    // Growth rate não tem comparação com período anterior
    // (é já uma métrica de comparação)
    return {
      value: growthRate,
      change: 0,
      changePercent: 0,
      trend: growthRate > 0 ? 'up' : growthRate < 0 ? 'down' : 'stable',
      previousValue: 0
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // AVERAGE METRICS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * LTV Médio - Lifetime Value
   */
  private async calculateAvgLTV(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // LTV = Receita média por aluno × Tempo médio como aluno
    // TODO: Implementar cálculo real com histórico de receita
    
    const ESTIMATED_LTV = 1500 // R$ 1,500 (placeholder)
    
    return this.createKPIMetric(ESTIMATED_LTV, ESTIMATED_LTV)
  }
  
  /**
   * Valor Médio de Pedido
   */
  private async calculateAvgOrderValue(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    const AVERAGE_PRICE = 500 // R$ 500 (placeholder)
    
    return this.createKPIMetric(AVERAGE_PRICE, AVERAGE_PRICE)
  }
  
  /**
   * Engagement Médio
   */
  private async calculateAvgEngagement(
    currentUPs: any[],
    previousUPs: any[]
  ): Promise<KPIMetric> {
    // Calcular engagement médio dos UserProducts
    const currentEngagements = currentUPs
      .map(up => up.engagement?.engagementScore || 0)
      .filter(score => score > 0)
    
    const previousEngagements = previousUPs
      .map(up => up.engagement?.engagementScore || 0)
      .filter(score => score > 0)
    
    const current = currentEngagements.length > 0
      ? currentEngagements.reduce((sum, score) => sum + score, 0) / currentEngagements.length
      : 0
    
    const previous = previousEngagements.length > 0
      ? previousEngagements.reduce((sum, score) => sum + score, 0) / previousEngagements.length
      : 0
    
    return this.createKPIMetric(current, previous)
  }
  
  // ═════════════════════════════════════════════════════════════════
  // TIME SERIES (para gráficos)
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Gerar série temporal de crescimento acumulado
   */
  async generateCumulativeTimeSeries(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' | 'year',
    productId?: string,
    platform?: string
  ) {
    console.log('📈 [Time Series] Gerando série temporal acumulada...')
    
    const timeSeries: any[] = []
    const intervals = this.getIntervals(startDate, endDate, interval)
    
    for (const { start, end, label } of intervals) {
      const query: any = {
        enrolledAt: { $lte: end }
      }
      
      if (productId) query.productId = productId
      if (platform) query.platform = platform
      
      const userProducts = await UserProduct.find(query).lean()
      
      // Contar users únicos
      const uniqueUsers = new Set(
        userProducts.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
      )
      
      timeSeries.push({
        date: end.toISOString(),
        value: uniqueUsers.size,
        label
      })
    }
    
    console.log(`✅ [Time Series] ${timeSeries.length} pontos gerados`)
    return timeSeries
  }
  
  /**
   * Gerar série temporal de novas vendas
   */
  async generateNewStudentsTimeSeries(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' | 'year',
    productId?: string,
    platform?: string
  ) {
    console.log('📈 [Time Series] Gerando série de novas vendas...')
    
    const timeSeries: any[] = []
    const intervals = this.getIntervals(startDate, endDate, interval)
    
    for (const { start, end, label } of intervals) {
      const query: any = {
        enrolledAt: { $gte: start, $lte: end }
      }
      
      if (productId) query.productId = productId
      if (platform) query.platform = platform
      
      const userProducts = await UserProduct.find(query).lean()
      
      // Contar users únicos
      const uniqueUsers = new Set(
        userProducts.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
      )
      
      timeSeries.push({
        date: end.toISOString(),
        value: uniqueUsers.size,
        label
      })
    }
    
    console.log(`✅ [Time Series] ${timeSeries.length} pontos gerados`)
    return timeSeries
  }
  
  // ═════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Criar KPIMetric com comparação vs período anterior
   */
  private createKPIMetric(current: number, previous: number): KPIMetric {
    const change = current - previous
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0
    
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (change > 0) trend = 'up'
    else if (change < 0) trend = 'down'
    
    return {
      value: Math.round(current * 100) / 100, // 2 decimais
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      trend,
      previousValue: Math.round(previous * 100) / 100
    }
  }
  
  /**
   * Gerar intervalos de tempo para séries temporais
   */
  private getIntervals(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' | 'year'
  ): { start: Date; end: Date; label: string }[] {
    const intervals: { start: Date; end: Date; label: string }[] = []
    const current = new Date(startDate)
    
    while (current <= endDate) {
      const start = new Date(current)
      let end: Date
      let label: string
      
      switch (interval) {
        case 'day':
          end = new Date(current)
          end.setDate(end.getDate() + 1)
          label = current.toISOString().split('T')[0]
          break
        
        case 'week':
          end = new Date(current)
          end.setDate(end.getDate() + 7)
          label = `Week ${this.getWeekNumber(current)}`
          break
        
        case 'month':
          end = new Date(current)
          end.setMonth(end.getMonth() + 1)
          label = current.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
          break
        
        case 'year':
          end = new Date(current)
          end.setFullYear(end.getFullYear() + 1)
          label = current.getFullYear().toString()
          break
      }
      
      // Não ultrapassar endDate
      if (end > endDate) end = endDate
      
      intervals.push({ start, end, label })
      
      // Avançar current
      current.setTime(end.getTime() + 1)
    }
    
    return intervals
  }
  
  /**
   * Get week number of year
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════

const analyticsCalculatorService = new AnalyticsCalculatorService()

export default analyticsCalculatorService
export { analyticsCalculatorService }

// ════════════════════════════════════════════════════════════════════
// NOTAS DE IMPLEMENTAÇÃO:
// ════════════════════════════════════════════════════════════════════
//
// 1. CÁLCULOS PLACEHOLDER:
//    - Alguns cálculos usam valores estimados (AVERAGE_PRICE, etc)
//    - TODO: Adicionar campos de preço ao UserProduct
//    - TODO: Integrar com dados reais de Hotmart/CursEduca
//
// 2. PERFORMANCE:
//    - Queries otimizadas com lean()
//    - Agregação em memória (considerando ~5k documentos)
//    - TODO: Usar aggregation pipeline para datasets maiores
//
// 3. EXTENSIBILIDADE:
//    - Fácil adicionar novas métricas
//    - Padrão consistente: calcular current + previous
//    - Helper createKPIMetric reutilizável
//
// 4. TIME SERIES:
//    - Geração de séries temporais para gráficos
//    - Intervalos configuráveis (day/week/month/year)
//    - Users únicos (não UserProducts)
//
// ════════════════════════════════════════════════════════════════════