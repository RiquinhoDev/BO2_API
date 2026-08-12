// ════════════════════════════════════════════════════════════════════
// 💾 ANALYTICS CACHE SERVICE - VERSÃO FINAL CORRIGIDA
// ════════════════════════════════════════════════════════════════════
// Serviço para gerenciar cache de métricas calculadas
// Implementa estratégia de cache inteligente com refresh assíncrono
// ════════════════════════════════════════════════════════════════════
import AnalyticsCache, { ICacheMetrics } from '../../models/AnalyticsCache'
import { CacheConfig, CacheOptions } from '../../types/analytics.types'
import { analyticsCalculatorService } from './analyticsCalculator.service'


// ═══════════════════════════════════════════════════════════════════
// ANALYTICS CACHE SERVICE
// ═══════════════════════════════════════════════════════════════════

class AnalyticsCacheService {
  private readonly inFlightCalculations = new Map<string, Promise<ICacheMetrics>>()

  // Configuração de TTL (Time To Live) por período
  private readonly TTL_CONFIG: CacheConfig = {
    daily: 1,      // 1 hora
    weekly: 6,     // 6 horas
    monthly: 24,   // 24 horas (1 dia)
    yearly: 168    // 168 horas (7 dias)
  }
  
  // Versão atual do cache (para invalidação quando lógica muda)
  private readonly CACHE_VERSION = '1.0.0'

  // Helper para converter KPIMetric → number / comparação
  // Usamos `any` aqui para não nos chatearmos com o tipo exato do calculator
  private mapToCacheMetrics(raw: any): ICacheMetrics {
    const getValue = (m: any): number => {
      if (m == null) return 0
      if (typeof m === 'number') return m
      if (typeof m.value === 'number') return m.value
      return 0
    }

    const toComparison = (m: any) => ({
      value: typeof m?.value === 'number' ? m.value : getValue(m),
      change: typeof m?.change === 'number' ? m.change : 0,
      changePercent: typeof m?.changePercent === 'number' ? m.changePercent : 0
    })

    return {
      // KPIs Principais
      totalStudents: getValue(raw.totalStudents),
      activeStudents: getValue(raw.activeStudents),
      newStudents: getValue(raw.newStudents),
      churnedStudents: getValue(raw.churnedStudents),

      // Receita
      totalRevenue: getValue(raw.totalRevenue),
      mrr: getValue(raw.mrr),
      arr: getValue(raw.arr),

      // Taxas
      churnRate: getValue(raw.churnRate),
      retentionRate: getValue(raw.retentionRate),
      growthRate: getValue(raw.growthRate),

      // Valores Médios
      avgLTV: getValue(raw.avgLTV),
      avgOrderValue: getValue(raw.avgOrderValue),

      // Engagement
      avgEngagement: getValue(raw.avgEngagement),

      // Comparação com período anterior
      comparison: {
        totalStudents: toComparison(raw.totalStudents),
        revenue: toComparison(raw.totalRevenue),
        churnRate: toComparison(raw.churnRate),
        growthRate: toComparison(raw.growthRate)
      }
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Buscar métricas do cache ou calcular se necessário
   */
  async getOrCalculateMetrics(options: CacheOptions): Promise<ICacheMetrics> {
    console.log('💾 [Cache Service] Buscando métricas...')
    const startTime = Date.now()
    
    const {
      productId = null,
      platform = null,
      period,
      startDate,
      endDate,
      forceRefresh = false
    } = options
    
    // Se forceRefresh, recalcular sempre
    if (forceRefresh) {
      console.log('   🔄 Force refresh solicitado')
      return await this.calculateSingleflight(options)
    }
    
    // Buscar cache válido
    const cache = await AnalyticsCache.findOne({
      productId,
      platform,
      period,
      startDate: { $lte: startDate },
      endDate: { $gte: endDate },
      version: this.CACHE_VERSION,
      expiresAt: { $gt: new Date() }
    }).sort({ calculatedAt: -1 })
    
    if (cache) {
      const age = Date.now() - cache.calculatedAt.getTime()
      const ageMinutes = Math.round(age / 60000)
      
      console.log(`   ✅ Cache encontrado (idade: ${ageMinutes}min)`)
      
      // Se cache precisa refresh (50% da vida), fazer refresh assíncrono
      if (cache.needsRefresh()) {
        console.log('   🔄 Iniciando refresh assíncrono do cache...')
        this.calculateAndCache(options).catch(err => {
          console.error('   ❌ Erro no refresh assíncrono:', err)
        })
      }
      
      const duration = Date.now() - startTime
      console.log(`💾 [Cache Service] Métricas retornadas do cache em ${duration}ms`)
      
      return cache.metrics
    }
    
    // Cache não encontrado, calcular
    console.log('   ⚠️ Cache não encontrado, calculando...')
    return await this.calculateSingleflight(options)
  }
  
  /**
   * Calcular métricas e salvar no cache
   */
  private calculateSingleflight(options: CacheOptions): Promise<ICacheMetrics> {
    const key = JSON.stringify({
      productId: options.productId ?? null,
      platform: options.platform ?? null,
      period: options.period,
      startDate: options.startDate.toISOString(),
      endDate: options.endDate.toISOString(),
    })
    const existing = this.inFlightCalculations.get(key)
    if (existing) return existing

    const calculation = this.calculateAndCache(options)
    this.inFlightCalculations.set(key, calculation)
    void calculation.finally(() => {
      if (this.inFlightCalculations.get(key) === calculation) {
        this.inFlightCalculations.delete(key)
      }
    }).catch(() => undefined)
    return calculation
  }

  private async calculateAndCache(options: CacheOptions): Promise<ICacheMetrics> {
    console.log('🧮 [Cache Service] Calculando novas métricas...')
    const startTime = Date.now()
    
    const {
      productId = null,
      platform = null,
      period,
      startDate,
      endDate
    } = options
    
    const normalizedPlatform =
      platform && platform !== 'all' ? platform : undefined

    const rawMetrics = await analyticsCalculatorService.calculateMetrics({
      productId: productId || undefined,
      platform: normalizedPlatform,
      startDate,
      endDate,
      compareWithPrevious: true
    })

    // 🔁 Converter para o shape de ICacheMetrics (números + comparison)
    const metrics: ICacheMetrics = this.mapToCacheMetrics(rawMetrics)
    
    // Calcular expiresAt baseado no período
    const ttlHours = this.TTL_CONFIG[period]
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + ttlHours)
    
    // Criar/atualizar cache
    try {
      const cacheData = {
        productId,
        platform,
        period,
        startDate,
        endDate,
        metrics,
        calculatedAt: new Date(),
        expiresAt,
        version: this.CACHE_VERSION
      }
      
      // Usar upsert para evitar duplicados
      await AnalyticsCache.findOneAndUpdate(
        {
          productId,
          platform,
          period,
          startDate,
          endDate
        },
        cacheData,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      )
      
      const duration = Date.now() - startTime
      console.log(`✅ [Cache Service] Métricas calculadas e cacheadas em ${duration}ms`)
      console.log(`   📅 Expira em: ${expiresAt.toISOString()}`)
      
      return metrics
    } catch (error) {
      console.error('❌ [Cache Service] Erro ao salvar cache:', error)
      // Retornar métricas mesmo se falhar ao cachear
      return metrics
    }
  }
  
  /**
   * Invalidar cache de um produto específico
   */
  async invalidateProduct(productId: string): Promise<number> {
    console.log(`🗑️ [Cache Service] Invalidando cache do produto ${productId}...`)
    
    const result = await AnalyticsCache.deleteMany({ productId })
    
    console.log(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Invalidar cache de uma plataforma
   */
  async invalidatePlatform(platform: 'hotmart' | 'curseduca' | 'discord'): Promise<number> {
    console.log(`🗑️ [Cache Service] Invalidando cache da plataforma ${platform}...`)
    
    const result = await AnalyticsCache.deleteMany({ platform })
    
    console.log(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Invalidar todo o cache (quando lógica muda)
   */
  async invalidateAll(): Promise<number> {
    console.log('🗑️ [Cache Service] Invalidando TODO o cache...')
    
    const result = await AnalyticsCache.deleteMany({})
    
    console.log(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Limpar cache expirado (executar periodicamente)
   */
  async cleanExpired(): Promise<number> {
    console.log('🧹 [Cache Service] Limpando caches expirados...')
    
    const result = await AnalyticsCache.deleteMany({
      expiresAt: { $lt: new Date() }
    })
    
    console.log(`✅ ${result.deletedCount} caches expirados removidos`)
    return result.deletedCount
  }
  
  /**
   * Obter estatísticas do cache
   */
  async getCacheStats() {
    console.log('📊 [Cache Service] Coletando estatísticas...')
    
    const [
      total,
      expired,
      needsRefresh,
      byPeriod,
      oldestCache,
      newestCache
    ] = await Promise.all([
      // Total de caches
      AnalyticsCache.countDocuments(),
      
      // Caches expirados
      AnalyticsCache.countDocuments({ expiresAt: { $lt: new Date() } }),
      
      // Caches que precisam refresh
      AnalyticsCache.find({}).then(caches => 
        caches.filter(c => c.needsRefresh()).length
      ),
      
      // Por período
      AnalyticsCache.aggregate([
        {
          $group: {
            _id: '$period',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Cache mais antigo
      AnalyticsCache.findOne().sort({ calculatedAt: 1 }),
      
      // Cache mais recente
      AnalyticsCache.findOne().sort({ calculatedAt: -1 })
    ])
    
    return {
      total,
      expired,
      needsRefresh,
      valid: total - expired,
      byPeriod: byPeriod.reduce((acc, item) => {
        acc[item._id] = item.count
        return acc
      }, {} as Record<string, number>),
      oldest: oldestCache?.calculatedAt,
      newest: newestCache?.calculatedAt
    }
  }
  
  /**
   * Pre-aquecer cache (calcular métricas comuns antecipadamente)
   */
  async warmUpCache() {
    console.log('🔥 [Cache Service] Aquecendo cache...')
    
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    // Períodos comuns para pré-calcular
    const periods: CacheOptions[] = [
      // Mês atual - Todos os produtos
      {
        period: 'monthly',
        startDate: startOfMonth,
        endDate: endOfMonth
      },
      
      // Ano atual - Todos os produtos
      {
        period: 'yearly',
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31)
      }
    ]
    
    const results: { period: string; success: boolean; error?: unknown }[] = []
    
    for (const period of periods) {
      try {
        await this.getOrCalculateMetrics(period)
        results.push({ period: period.period, success: true })
      } catch (error) {
        console.error(`❌ Erro ao aquecer cache ${period.period}:`, error)
        results.push({ period: period.period, success: false, error })
      }
    }
    
    console.log(`✅ [Cache Service] Cache aquecido: ${results.filter(r => r.success).length}/${results.length} sucessos`)
    
    return results
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════

const analyticsCacheService = new AnalyticsCacheService()

export default analyticsCacheService
export { analyticsCacheService }
