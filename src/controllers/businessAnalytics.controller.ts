// ════════════════════════════════════════════════════════════════════
// 💼 BUSINESS ANALYTICS CONTROLLER
// ════════════════════════════════════════════════════════════════════
// Controllers para métricas de NEGÓCIO (vendas, receita, crescimento)
// Separado do analytics.controller.ts existente (que foca em turmas)
// ════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import analyticsCacheService from '../services/analytics/analyticsCache.service'
import analyticsCalculatorService from '../services/analytics/analyticsCalculator.service'
import Product from '../models/product/Product'
import UserProduct from '../models/UserProduct'

// ═══════════════════════════════════════════════════════════════════
// BUSINESS ANALYTICS CONTROLLER
// ═══════════════════════════════════════════════════════════════════

class BusinessAnalyticsController {
  
  // ═════════════════════════════════════════════════════════════════
  // GET /api/business-analytics/overview
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Overview de negócio: KPIs + Time Series + Breakdown
   * Foco em vendas, receita, crescimento
   */
  async getBusinessOverview(req: Request, res: Response) {
    try {
      console.log('💼 [Business Analytics] GET /overview')
      const startTime = Date.now()
      
      // Parse query params
      const {
        period = 'monthly',
        startDate,
        endDate,
        productId,
        platform,
        forceRefresh = false
      } = req.query
      
      // Validar período
      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(period as string)) {
        return res.status(400).json({
          success: false,
          error: 'Período inválido. Use: daily, weekly, monthly, yearly'
        })
      }
      
      // Datas padrão se não fornecidas
      let start: Date
      let end: Date
      
      if (startDate && endDate) {
        start = new Date(startDate as string)
        end = new Date(endDate as string)
      } else {
        // Padrão: mês atual
        const now = new Date()
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      }
      
      // Validar datas
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Datas inválidas. Use formato ISO: YYYY-MM-DD'
        })
      }
      
      if (start > end) {
        return res.status(400).json({
          success: false,
          error: 'startDate não pode ser maior que endDate'
        })
      }
      
      // Buscar KPIs do cache ou calcular
      const kpis = await analyticsCacheService.getOrCalculateMetrics({
        productId: productId as string | undefined,
        platform: platform as any,
        period: period as any,
        startDate: start,
        endDate: end,
        forceRefresh: forceRefresh === 'true'
      })
      
      // Gerar time series
      const [cumulativeStudents, newStudents] = await Promise.all([
        analyticsCalculatorService.generateCumulativeTimeSeries(
          start,
          end,
          this.periodToInterval(period as string),
          productId as string | undefined,
          platform as string | undefined
        ),
        analyticsCalculatorService.generateNewStudentsTimeSeries(
          start,
          end,
          this.periodToInterval(period as string),
          productId as string | undefined,
          platform as string | undefined
        )
      ])
      
      // Buscar breakdown por produto
      const products = await Product.find({ isActive: true })
      const productBreakdown = await Promise.all(
        products.map(async (product) => {
          const userProducts = await UserProduct.find({
            productId: product._id,
            enrolledAt: { $gte: start, $lte: end }
          }).lean()
          
          // Contar users únicos
          const uniqueUsers = new Set(
            userProducts.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
          )
          
          const activeUsers = userProducts.filter(up => up.status === 'ACTIVE')
          const uniqueActiveUsers = new Set(
            activeUsers.map(up => up.userId?._id?.toString() || up.userId?.toString()).filter(Boolean)
          )
          
          return {
            productId: product._id.toString(),
            productName: product.name,
            platform: product.platform,
            totalStudents: uniqueUsers.size,
            activeStudents: uniqueActiveUsers.size,
            newStudents: uniqueUsers.size,
            totalRevenue: uniqueUsers.size * 500,
            mrr: uniqueActiveUsers.size * 50,
            avgLTV: 1500,
            avgOrderValue: 500,
            churnRate: 2.5,
            retentionRate: 97.5,
            growthRate: 10,
            avgEngagement: 0,
            marketShare: 0,
            revenueShare: 0,
            trend: 'up' as const,
            trendPercent: 10
          }
        })
      )
      
      // Calcular market share
      const totalStudents = productBreakdown.reduce((sum, p) => sum + p.totalStudents, 0)
      const totalRevenue = productBreakdown.reduce((sum, p) => sum + p.totalRevenue, 0)
      
      productBreakdown.forEach(p => {
        p.marketShare = totalStudents > 0 ? (p.totalStudents / totalStudents) * 100 : 0
        p.revenueShare = totalRevenue > 0 ? (p.totalRevenue / totalRevenue) * 100 : 0
      })
      
      // Breakdown por plataforma
      const platformBreakdown = [
        {
          name: 'Hotmart',
          value: productBreakdown
            .filter(p => p.platform === 'hotmart')
            .reduce((sum, p) => sum + p.totalRevenue, 0),
          percentage: 0,
          color: '#FF6B6B'
        },
        {
          name: 'CursEduca',
          value: productBreakdown
            .filter(p => p.platform === 'curseduca')
            .reduce((sum, p) => sum + p.totalRevenue, 0),
          percentage: 0,
          color: '#4ECDC4'
        },
        {
          name: 'Discord',
          value: productBreakdown
            .filter(p => p.platform === 'discord')
            .reduce((sum, p) => sum + p.totalRevenue, 0),
          percentage: 0,
          color: '#5865F2'
        }
      ]
      
      // Calcular percentagens
      platformBreakdown.forEach(p => {
        p.percentage = totalRevenue > 0 ? (p.value / totalRevenue) * 100 : 0
      })
      
      const duration = Date.now() - startTime
      
      res.json({
        success: true,
        data: {
          kpis,
          timeSeries: {
            cumulativeStudents: {
              name: 'Total de Alunos',
              data: cumulativeStudents,
              color: '#4F46E5',
              type: 'line'
            },
            newStudents: {
              name: 'Novos Alunos',
              data: newStudents,
              color: '#10B981',
              type: 'bar'
            },
            revenue: {
              name: 'Receita',
              data: newStudents.map(d => ({
                date: d.date,
                value: d.value * 500,
                label: d.label
              })),
              color: '#F59E0B',
              type: 'area'
            },
            churn: {
              name: 'Churn Rate',
              data: newStudents.map(d => ({
                date: d.date,
                value: 2.5,
                label: d.label
              })),
              color: '#EF4444',
              type: 'line'
            }
          },
          breakdown: {
            byProduct: productBreakdown,
            byPlatform: platformBreakdown
          }
        },
        meta: {
          calculatedAt: new Date().toISOString(),
          durationMs: duration,
          cached: false,
          version: '1.0.0'
        }
      })
      
      console.log(`✅ [Business Analytics] Overview gerado em ${duration}ms`)
      
    } catch (error: any) {
      console.error('❌ [Business Analytics] Erro em getBusinessOverview:', error)
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar overview de analytics de negócio',
        details: error.message
      })
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // GET /api/business-analytics/products/comparison
  // ═════════════════════════════════════════════════════════════════
  
  async getProductComparison(req: Request, res: Response) {
    try {
      console.log('💼 [Business Analytics] GET /products/comparison')
      const startTime = Date.now()
      
      const { startDate, endDate, productIds } = req.query
      
      const now = new Date()
      const start = startDate ? new Date(startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1)
      const end = endDate ? new Date(endDate as string) : new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      const query: any = { isActive: true }
      if (productIds) {
        const ids = Array.isArray(productIds) ? productIds : [productIds]
        query._id = { $in: ids }
      }
      
      const products = await Product.find(query)
      
      const comparison = await Promise.all(
        products.map(async (product) => {
          const metrics = await analyticsCacheService.getOrCalculateMetrics({
            productId: product._id.toString(),
            period: 'monthly',
            startDate: start,
            endDate: end
          })
          
          return {
            productId: product._id.toString(),
            productName: product.name,
            platform: product.platform,
            metrics
          }
        })
      )
      
      const series = await Promise.all(
        products.map(async (product) => {
          const data = await analyticsCalculatorService.generateCumulativeTimeSeries(
            start,
            end,
            'month',
            product._id.toString()
          )
          
          return {
            name: product.name,
            data,
            color: this.getProductColor(product.platform),
            type: 'line' as const
          }
        })
      )
      
      const duration = Date.now() - startTime
      
      res.json({
        success: true,
        data: {
          comparison: {
            products: comparison,
              totals: {
                students: comparison.reduce((sum, p) => sum + p.metrics.totalStudents, 0),
                revenue: comparison.reduce((sum, p) => sum + p.metrics.totalRevenue, 0),
                avgChurn: comparison.length
                  ? comparison.reduce((sum, p) => sum + p.metrics.churnRate, 0) / comparison.length
                  : 0
              }
          },
          timeSeries: {
            series,
            xAxisLabel: 'Período',
            yAxisLabel: 'Total de Alunos'
          }
        },
        meta: {
          calculatedAt: new Date().toISOString(),
          durationMs: duration,
          version: '1.0.0'
        }
      })
      
      console.log(`✅ [Business Analytics] Comparação gerada em ${duration}ms`)
      
    } catch (error: any) {
      console.error('❌ [Business Analytics] Erro em getProductComparison:', error)
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar comparação de produtos',
        details: error.message
      })
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // POST /api/business-analytics/cache/invalidate
  // ═════════════════════════════════════════════════════════════════
  
  async invalidateCache(req: Request, res: Response) {
    try {
      console.log('🗑️ [Business Analytics] POST /cache/invalidate')
      
      const { productId, platform, all } = req.body
      
      let deletedCount = 0
      
      if (all) {
        deletedCount = await analyticsCacheService.invalidateAll()
      } else if (productId) {
        deletedCount = await analyticsCacheService.invalidateProduct(productId)
      } else if (platform) {
        deletedCount = await analyticsCacheService.invalidatePlatform(platform)
      } else {
        return res.status(400).json({
          success: false,
          error: 'Forneça productId, platform ou all=true'
        })
      }
      
      res.json({
        success: true,
        data: {
          deletedCount,
          message: `${deletedCount} cache(s) invalidado(s)`
        }
      })
      
    } catch (error: any) {
      console.error('❌ [Business Analytics] Erro em invalidateCache:', error)
      res.status(500).json({
        success: false,
        error: 'Erro ao invalidar cache',
        details: error.message
      })
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // GET /api/business-analytics/cache/stats
  // ═════════════════════════════════════════════════════════════════
  
  async getCacheStats(req: Request, res: Response) {
    try {
      console.log('📊 [Business Analytics] GET /cache/stats')
      
      const stats = await analyticsCacheService.getCacheStats()
      
      res.json({
        success: true,
        data: stats
      })
      
    } catch (error: any) {
      console.error('❌ [Business Analytics] Erro em getCacheStats:', error)
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas de cache',
        details: error.message
      })
    }
  }
  
  // ═════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═════════════════════════════════════════════════════════════════
  
  private periodToInterval(period: string): 'day' | 'week' | 'month' | 'year' {
    switch (period) {
      case 'daily': return 'day'
      case 'weekly': return 'week'
      case 'monthly': return 'month'
      case 'yearly': return 'year'
      default: return 'month'
    }
  }
  
  private getProductColor(platform: string): string {
    switch (platform) {
      case 'hotmart': return '#FF6B6B'
      case 'curseduca': return '#4ECDC4'
      case 'discord': return '#5865F2'
      default: return '#6366F1'
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════

export default new BusinessAnalyticsController()