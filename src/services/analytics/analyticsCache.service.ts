import logger from '../../utils/logger'
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
  private readonly FLIGHT_TIMEOUT_MS = 30_000

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
  private mapToCacheMetrics(raw: Record<string, unknown>): ICacheMetrics {
    const getValue = (m: unknown): number => {
      if (m == null) return 0
      if (typeof m === 'number') return m
      if (typeof m === 'object' && 'value' in m && typeof m.value === 'number') return m.value
      return 0
    }

    const toComparison = (m: unknown) => {
      const metric = typeof m === 'object' && m !== null ? m : {}
      return {
        value: 'value' in metric && typeof metric.value === 'number' ? metric.value : getValue(m),
        change: 'change' in metric && typeof metric.change === 'number' ? metric.change : 0,
        changePercent: 'changePercent' in metric && typeof metric.changePercent === 'number' ? metric.changePercent : 0
      }
    }

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
    logger.info('💾 [Cache Service] Buscando métricas...')
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
      logger.info('   🔄 Force refresh solicitado')
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
      
      logger.info(`   ✅ Cache encontrado (idade: ${ageMinutes}min)`)
      
      // Se cache precisa refresh (50% da vida), fazer refresh assíncrono
      if (cache.needsRefresh()) {
        logger.info('   🔄 Iniciando refresh assíncrono do cache...')
        this.calculateSingleflight(options).catch(err => {
          logger.error('   ❌ Erro no refresh assíncrono:', err)
        })
      }
      
      const duration = Date.now() - startTime
      logger.info(`💾 [Cache Service] Métricas retornadas do cache em ${duration}ms`)
      
      return cache.metrics
    }
    
    // Cache não encontrado, calcular
    logger.info('   ⚠️ Cache não encontrado, calculando...')
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
    const evictionTimer = setTimeout(() => {
      if (this.inFlightCalculations.get(key) === calculation) {
        this.inFlightCalculations.delete(key)
      }
    }, this.FLIGHT_TIMEOUT_MS)
    evictionTimer.unref?.()
    void calculation.finally(() => {
      clearTimeout(evictionTimer)
      if (this.inFlightCalculations.get(key) === calculation) {
        this.inFlightCalculations.delete(key)
      }
    }).catch(() => undefined)
    return calculation
  }

  private async calculateAndCache(options: CacheOptions): Promise<ICacheMetrics> {
    logger.info('🧮 [Cache Service] Calculando novas métricas...')
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
      logger.info(`✅ [Cache Service] Métricas calculadas e cacheadas em ${duration}ms`)
      logger.info(`   📅 Expira em: ${expiresAt.toISOString()}`)
      
      return metrics
    } catch (error) {
      logger.error('❌ [Cache Service] Erro ao salvar cache:', error)
      // Retornar métricas mesmo se falhar ao cachear
      return metrics
    }
  }
  
  /**
   * Invalidar cache de um produto específico
   */
  async invalidateProduct(productId: string): Promise<number> {
    logger.info(`🗑️ [Cache Service] Invalidando cache do produto ${productId}...`)
    
    const result = await AnalyticsCache.deleteMany({ productId })
    
    logger.info(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Invalidar cache de uma plataforma
   */
  async invalidatePlatform(platform: 'hotmart' | 'curseduca' | 'discord'): Promise<number> {
    logger.info(`🗑️ [Cache Service] Invalidando cache da plataforma ${platform}...`)
    
    const result = await AnalyticsCache.deleteMany({ platform })
    
    logger.info(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Invalidar todo o cache (quando lógica muda)
   */
  async invalidateAll(): Promise<number> {
    logger.info('🗑️ [Cache Service] Invalidando TODO o cache...')
    
    const result = await AnalyticsCache.deleteMany({})
    
    logger.info(`✅ ${result.deletedCount} caches invalidados`)
    return result.deletedCount
  }
  
  /**
   * Limpar cache expirado (executar periodicamente)
   */
  async cleanExpired(): Promise<number> {
    logger.info('🧹 [Cache Service] Limpando caches expirados...')
    
    const result = await AnalyticsCache.deleteMany({
      expiresAt: { $lt: new Date() }
    })
    
    logger.info(`✅ ${result.deletedCount} caches expirados removidos`)
    return result.deletedCount
  }
  
  /**
   * Obter estatísticas do cache
   */
  async getCacheStats() {
    logger.info('📊 [Cache Service] Coletando estatísticas...')
    
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
      AnalyticsCache.aggregate<{ count: number }>([
        {
          $match: {
            $expr: {
              $gt: ['$$NOW', { $add: ['$calculatedAt', { $divide: [{ $subtract: ['$expiresAt', '$calculatedAt'] }, 2] }] }]
            }
          }
        },
        { $count: 'count' }
      ]).then(([result]) => result?.count ?? 0),
      
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
    logger.info('🔥 [Cache Service] Aquecendo cache...')
    
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
        logger.error(`❌ Erro ao aquecer cache ${period.period}:`, error)
        results.push({ period: period.period, success: false, error })
      }
    }
    
    logger.info(`✅ [Cache Service] Cache aquecido: ${results.filter(r => r.success).length}/${results.length} sucessos`)
    
    return results
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════

const analyticsCacheService = new AnalyticsCacheService()

export default analyticsCacheService
export { analyticsCacheService }
