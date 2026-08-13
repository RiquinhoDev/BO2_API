// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“ src/services/productSalesStatsBuilder.service.ts
// SERVICE: Construtor de EstatÃ­sticas de Vendas por Produto
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import logger from '../utils/logger'
import ProductSalesStats, { 
  IMonthlySales, 
  IYearlySales,
  IDateSourceBreakdown,
} from '../models/product/ProductSalesStats'
import UserProduct from '../models/UserProduct'
import Product from '../models/product/Product'
import User from '../models/user'
import mongoose from 'mongoose'
import { boundedQueryLimit } from '../utils/queryBounds'
import { determineSaleDate } from './productSales/dateResolver'

export async function buildProductSalesStats(): Promise<void> {
  logger.info('\nðŸ—ï¸ ========================================')
  logger.info('ðŸ—ï¸ CONSTRUINDO PRODUCT SALES STATS')
  logger.info('ðŸ—ï¸ ========================================\n')
  
  const startTime = Date.now()
  
  try {
    const products = await Product.find({ isActive: true })
    logger.info(`ðŸ“¦ ${products.length} produtos ativos encontrados\n`)
    
    for (const product of products) {
      logger.info(`\nðŸ“Š Processando produto: ${product.code} (${product.name})`)
      
      const userProducts = await UserProduct.find({ 
        productId: product._id 
      }).populate('userId').lean()
      
      logger.info(`   âœ… ${userProducts.length} UserProducts encontrados`)
      
      if (userProducts.length === 0) {
        logger.info(`   â­ï¸  Pulando produto sem vendas`)
        continue
      }
      
      const monthlyMap = new Map<string, IMonthlySales>()
      const yearlyMap = new Map<number, IYearlySales>()
      const overallSources: IDateSourceBreakdown = {
        purchaseDate: 0,
        joinedDate: 0,
        enrolledAt: 0,
        joinedServer: 0,
        firstSystemEntry: 0,
        createdAt: 0,
        unknown: 0
      }
      
      let oldestSale: Date | null = null
      let newestSale: Date | null = null
      let recordsProcessed = 0
      let recordsWithValidDates = 0
      let recordsWithoutDates = 0
      
      const userIds = userProducts.map(up => 
        typeof up.userId === 'object' && up.userId._id ? up.userId._id : up.userId
      )
      const users = await User.find({ _id: { $in: userIds } }).lean()
      const userMap = new Map(users.map(u => [u._id.toString(), u]))
      
      const userFirstProducts = new Map<string, string>()
      
      const uniqueUserIds = Array.from(
        new Map(userIds.map(userId => [userId.toString(), userId])).values()
      )
      const allUserProducts = await UserProduct.find({
        userId: { $in: uniqueUserIds }
      }).sort({ enrolledAt: 1, _id: 1 }).lean()

      for (const firstEnrollment of allUserProducts) {
        const firstUserId = firstEnrollment.userId.toString()
        if (!userFirstProducts.has(firstUserId)) {
          userFirstProducts.set(firstUserId, (firstEnrollment._id as mongoose.Types.ObjectId).toString())
        }
      }

      for (const up of userProducts) {
        recordsProcessed++
        
        const userId = (typeof up.userId === 'object' && up.userId._id 
          ? up.userId._id 
          : up.userId).toString()
        
        const userProductId = (up._id as mongoose.Types.ObjectId).toString()
        const user = userMap.get(userId)
        
        if (!user) {
          logger.warn(`   âš ï¸ User ${userId} nÃ£o encontrado`)
          recordsWithoutDates++
          overallSources.unknown++
          continue
        }
        
        try {
          const { date: saleDate, source } = await determineSaleDate(up, user)
          recordsWithValidDates++
          overallSources[source]++
          
          if (!oldestSale || saleDate < oldestSale) oldestSale = saleDate
          if (!newestSale || saleDate > newestSale) newestSale = saleDate
          
          const year = saleDate.getFullYear()
          const month = saleDate.getMonth() + 1
          const monthKey = `${year}-${month.toString().padStart(2, '0')}`
          const isNewStudent = userFirstProducts.get(userId) === userProductId
          
          if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, {
              year,
              month,
              count: 0,
              newStudents: 0,
              existingStudents: 0,
              dataSources: {
                purchaseDate: 0,
                joinedDate: 0,
                enrolledAt: 0,
                joinedServer: 0,
                firstSystemEntry: 0,
                createdAt: 0,
                unknown: 0
              },
              oldestSale: saleDate,
              newestSale: saleDate
            })
          }
          
          const monthStats = monthlyMap.get(monthKey)!
          monthStats.count++
          monthStats.dataSources[source]++
          
          if (isNewStudent) {
            monthStats.newStudents++
          } else {
            monthStats.existingStudents++
          }
          
          if (saleDate < monthStats.oldestSale) monthStats.oldestSale = saleDate
          if (saleDate > monthStats.newestSale) monthStats.newestSale = saleDate
          
          if (!yearlyMap.has(year)) {
            yearlyMap.set(year, {
              year,
              count: 0,
              newStudents: 0,
              existingStudents: 0,
              dataSources: {
                purchaseDate: 0,
                joinedDate: 0,
                enrolledAt: 0,
                joinedServer: 0,
                firstSystemEntry: 0,
                createdAt: 0,
                unknown: 0
              },
              monthlyBreakdown: Array(12).fill(0)
            })
          }
          
          const yearStats = yearlyMap.get(year)!
          yearStats.count++
          yearStats.dataSources[source]++
          yearStats.monthlyBreakdown[month - 1]++
          
          if (isNewStudent) {
            yearStats.newStudents++
          } else {
            yearStats.existingStudents++
          }
          
        } catch (error) {
          logger.error(`   âŒ Erro ao processar UserProduct ${up._id}:`, error)
          recordsWithoutDates++
          overallSources.unknown++
        }
      }
      
      const salesByMonth = Array.from(monthlyMap.values())
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year
          return a.month - b.month
        })
      
      const salesByYear = Array.from(yearlyMap.values())
        .sort((a, b) => a.year - b.year)
      
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      
      const totals = {
        allTime: recordsWithValidDates,
        lastYear: salesByYear.find(y => y.year === currentYear - 1)?.count || 0,
        last6Months: 0,
        last3Months: 0,
        lastMonth: 0,
        currentMonth: 0
      }
      
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      
      const lastMonthDate = new Date()
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
      
      salesByMonth.forEach(m => {
        const monthDate = new Date(m.year, m.month - 1, 1)
        
        if (monthDate >= sixMonthsAgo) totals.last6Months += m.count
        if (monthDate >= threeMonthsAgo) totals.last3Months += m.count
        
        if (m.year === lastMonthDate.getFullYear() && m.month === lastMonthDate.getMonth() + 1) {
          totals.lastMonth = m.count
        }
        
        if (m.year === currentYear && m.month === currentMonth) {
          totals.currentMonth = m.count
        }
      })
      
      await ProductSalesStats.findOneAndUpdate(
        { productId: product._id },
        {
          $set: {
            productCode: product.code,
            productName: product.name,
            platform: product.platform,
            salesByMonth,
            salesByYear,
            totals,
            overallDataSources: overallSources,
            meta: {
              calculatedAt: new Date(),
              oldestSale,
              newestSale,
              totalRecordsProcessed: recordsProcessed,
              recordsWithValidDates,
              recordsWithoutDates
            }
          }
        },
        { upsert: true, new: true }
      )
      
      logger.info(`   âœ… Stats guardados:`)
      logger.info(`      â€¢ Total vendas: ${totals.allTime}`)
      logger.info(`      â€¢ Registos processados: ${recordsProcessed}`)
      logger.info(`      â€¢ Com datas vÃ¡lidas: ${recordsWithValidDates}`)
      logger.info(`      â€¢ Sem datas: ${recordsWithoutDates}`)
      logger.info(`      â€¢ Fontes de dados:`)
      logger.info(`        - purchaseDate: ${overallSources.purchaseDate}`)
      logger.info(`        - joinedDate: ${overallSources.joinedDate}`)
      logger.info(`        - enrolledAt: ${overallSources.enrolledAt}`)
      logger.info(`        - ðŸ†• firstSystemEntry: ${overallSources.firstSystemEntry}`)
      logger.info(`        - unknown: ${overallSources.unknown}`)
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    logger.info(`\nâœ… Product Sales Stats construÃ­dos com sucesso em ${duration}s`)
    
  } catch (error) {
    logger.error('âŒ Erro ao construir Product Sales Stats:', error)
    throw error
  }
}

export async function getProductSalesStats(
  requestedLimit?: unknown,
  productId?: string
) {
  try {
    const query = productId ? { productId } : {}
    
    const stats = await ProductSalesStats.find(query)
      .sort({ 'meta.calculatedAt': -1, _id: -1 })
      .limit(boundedQueryLimit(requestedLimit, 200))
      .lean()
    
    return stats
  } catch (error) {
    logger.error('âŒ Erro ao buscar Product Sales Stats:', error)
    throw error
  }
}

export default {
  buildProductSalesStats,
  getProductSalesStats
}
