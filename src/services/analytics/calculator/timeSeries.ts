import logger from '../../../utils/logger'
import mongoose, { type FilterQuery } from 'mongoose'
import UserProduct, { type IUserProduct } from '../../../models/UserProduct'
import type { TimeSeriesPoint } from '../../../types/analytics.types'

function getAnalyticsUserId(userProduct: { userId: unknown }): string {
  const reference = userProduct.userId
  if (reference instanceof mongoose.Types.ObjectId) return reference.toString()
  if (typeof reference === 'object' && reference !== null && '_id' in reference) {
    return String(reference._id)
  }
  return String(reference)
}
export async function generateCumulativeTimeSeries(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' | 'year',
    productId?: string,
    platform?: string
  ) {
    logger.info('📈 [Time Series] Gerando série temporal acumulada...')
    
    const timeSeries: TimeSeriesPoint[] = []
    const intervals = getIntervals(startDate, endDate, interval)
    
    for (const { start, end, label } of intervals) {
      const query: FilterQuery<IUserProduct> = {
        enrolledAt: { $lte: end }
      }
      
      if (productId) query.productId = productId
      if (platform) query.platform = platform
      
      const userProducts = await UserProduct.find(query).lean()
      
      // Contar users únicos
      const uniqueUsers = new Set(
        userProducts.map(getAnalyticsUserId)
      )
      
      timeSeries.push({
        date: end.toISOString(),
        value: uniqueUsers.size,
        label
      })
    }
    
    logger.info(`✅ [Time Series] ${timeSeries.length} pontos gerados`)
    return timeSeries
  }
  
  /**
   * Gerar série temporal de novas vendas
   */
export async function generateNewStudentsTimeSeries(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' | 'year',
    productId?: string,
    platform?: string
  ) {
    logger.info('📈 [Time Series] Gerando série de novas vendas...')
    
    const timeSeries: TimeSeriesPoint[] = []
    const intervals = getIntervals(startDate, endDate, interval)
    
    for (const { start, end, label } of intervals) {
      const query: FilterQuery<IUserProduct> = {
        enrolledAt: { $gte: start, $lte: end }
      }
      
      if (productId) query.productId = productId
      if (platform) query.platform = platform
      
      const userProducts = await UserProduct.find(query).lean()
      
      // Contar users únicos
      const uniqueUsers = new Set(
        userProducts.map(getAnalyticsUserId)
      )
      
      timeSeries.push({
        date: end.toISOString(),
        value: uniqueUsers.size,
        label
      })
    }
    
    logger.info(`✅ [Time Series] ${timeSeries.length} pontos gerados`)
    return timeSeries
  }
  
  // ═════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═════════════════════════════════════════════════════════════════
  
  /**
   * Criar KPIMetric com comparação vs período anterior
   */
function getIntervals(
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
          label = `Week ${getWeekNumber(current)}`
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
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }
