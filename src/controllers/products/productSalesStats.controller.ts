// ════════════════════════════════════════════════════════════
// 📁 src/controllers/productSalesStats.controller.ts
// CONTROLLER: Product Sales Stats API
// ════════════════════════════════════════════════════════════

import { type NextFunction, Request, Response } from 'express'
import { internalError } from '../../security/errorHandling'

import ProductSalesStats from '../../models/product/ProductSalesStats'
import { buildProductSalesStats, getProductSalesStats } from '../../services/productSalesStatsBuilder'
// ─────────────────────────────────────────────────────────────
// GET ALL STATS
// ─────────────────────────────────────────────────────────────

export async function getAllProductSalesStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getProductSalesStats()
    
    res.json({
      success: true,
      data: stats,
      meta: {
        count: stats.length,
        timestamp: new Date()
      }
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'PRODUCT_SALES_STATS_LIST_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// GET STATS POR PRODUTO
// ─────────────────────────────────────────────────────────────

export async function getProductSalesStatsByProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params
    
    const stats = await ProductSalesStats.findOne({ productId }).lean()
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Estatísticas não encontradas para este produto'
      })
    }
    
    res.json({
      success: true,
      data: stats
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'PRODUCT_SALES_STATS_READ_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// GET STATS POR PERÍODO
// ─────────────────────────────────────────────────────────────

export async function getProductSalesByPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, productId } = req.query
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são obrigatórios'
      })
    }
    
    const start = new Date(startDate as string)
    const end = new Date(endDate as string)
    
    const query = productId ? { productId } : {}
    
    const stats = await ProductSalesStats.find(query).lean()
    
    // Filtrar por período
    const filtered = stats.map(stat => ({
      ...stat,
   salesByMonth: stat.salesByMonth.filter((sale: { year: number; month: number }) => {
        const saleDate = new Date(sale.year, sale.month - 1, 1)
        return saleDate >= start && saleDate <= end
      })
    }))
    
    res.json({
      success: true,
      data: filtered,
      period: {
        start: startDate,
        end: endDate
      }
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'PRODUCT_SALES_PERIOD_READ_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// REBUILD MANUAL
// ─────────────────────────────────────────────────────────────

export async function rebuildProductSalesStatsEndpoint(req: Request, res: Response, next: NextFunction) {
  try {
    console.log('🔄 Rebuild manual de Product Sales Stats iniciado...')
    
    // Responder imediatamente (processo roda em background)
    res.json({
      success: true,
      message: 'Rebuild de Product Sales Stats iniciado em background',
      estimatedTime: '30-60 segundos'
    })
    
    // Executar rebuild em background
    buildProductSalesStats()
      .then(() => {
        console.log('✅ Rebuild manual completado')
      })
      .catch(error => {
        console.error('❌ Erro no rebuild manual:', error)
      })
    
  } catch (error: unknown) {
    next(internalError('Erro ao iniciar rebuild', 'PRODUCT_SALES_REBUILD_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// COMPARAR PRODUTOS
// ─────────────────────────────────────────────────────────────

export async function compareProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { productIds } = req.body // Array de IDs
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'productIds deve ser um array com pelo menos 1 ID'
      })
    }
    
    const stats = await ProductSalesStats.find({
      productId: { $in: productIds }
    }).lean()
    
    // Comparar métricas
    const comparison = stats.map(stat => ({
      productCode: stat.productCode,
      productName: stat.productName,
      platform: stat.platform,
      totals: stat.totals,
      growthRate: calculateGrowthRate(stat.salesByMonth),
      averageMonthlySales: calculateAverage(stat.salesByMonth),
      peakMonth: findPeakMonth(stat.salesByMonth),
      dataSources: stat.overallDataSources
    }))
    
    res.json({
      success: true,
      data: comparison
    })
  } catch (error: unknown) {
    next(internalError('Erro ao comparar produtos', 'PRODUCT_SALES_COMPARE_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function calculateGrowthRate(salesByMonth: any[]): number {
  if (salesByMonth.length < 2) return 0
  
  const recent6Months = salesByMonth.slice(-6)
  if (recent6Months.length < 2) return 0
  
  const first = recent6Months[0].count
  const last = recent6Months[recent6Months.length - 1].count
  
  if (first === 0) return 0
  
  return Math.round(((last - first) / first) * 100)
}

function calculateAverage(salesByMonth: any[]): number {
  if (salesByMonth.length === 0) return 0
  
  const total = salesByMonth.reduce((sum, month) => sum + month.count, 0)
  return Math.round(total / salesByMonth.length)
}

function findPeakMonth(salesByMonth: any[]): any {
  if (salesByMonth.length === 0) return null
  
  return salesByMonth.reduce((peak, month) => 
    month.count > peak.count ? month : peak
  )
}