// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ“ src/services/productSalesStatsBuilder.service.ts
// SERVICE: Construtor de EstatÃ­sticas de Vendas por Produto
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
  console.log('\nðŸ—ï¸ ========================================')
  console.log('ðŸ—ï¸ CONSTRUINDO PRODUCT SALES STATS')
  console.log('ðŸ—ï¸ ========================================\n')
  
  const startTime = Date.now()
  
  try {
    // 1. Buscar todos os produtos
    const products = await Product.find({ isActive: true })
    console.log(`ðŸ“¦ ${products.length} produtos ativos encontrados\n`)
    
    // 2. Processar cada produto
    for (const product of products) {
      console.log(`\nðŸ“Š Processando produto: ${product.code} (${product.name})`)
      
      // 2.1. Buscar UserProducts deste produto
      const userProducts = await UserProduct.find({ 
        productId: product._id 
      }).populate('userId').lean()
      
      console.log(`   âœ… ${userProducts.length} UserProducts encontrados`)
      
      if (userProducts.length === 0) {
        console.log(`   â­ï¸  Pulando produto sem vendas`)
        continue
      }
      
      // 2.2. Estruturas de agregaÃ§Ã£o
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
      
      // 2.3. Buscar todos os users uma vez (performance)
      const userIds = userProducts.map(up => 
        typeof up.userId === 'object' && up.userId._id ? up.userId._id : up.userId
      )
      const users = await User.find({ _id: { $in: userIds } }).lean()
      const userMap = new Map(users.map(u => [u._id.toString(), u]))
      
      // 2.4. Determinar quais users sÃ£o "novos" (primeiro produto)
  const userFirstProducts = new Map<string, string>() // âœ… MUDANÃ‡A: mongoose.Types.ObjectId â†’ string
      
      for (const up of userProducts) {
        const userId = (typeof up.userId === 'object' && up.userId._id 
          ? up.userId._id 
          : up.userId).toString()
        
        if (!userFirstProducts.has(userId)) {
          // Buscar todos os produtos deste user
          const allUserProducts = await UserProduct.find({
            userId: up.userId
          }).sort({ enrolledAt: 1 }).lean()
          
          if (allUserProducts.length > 0) {
            // âœ… CORREÃ‡ÃƒO: Type assertion e conversÃ£o para string
            const firstProductId = (allUserProducts[0]._id as mongoose.Types.ObjectId).toString()
            userFirstProducts.set(userId, firstProductId)
          }
        }
      }
      
  // 2.5. Processar cada UserProduct
      for (const up of userProducts) {
        recordsProcessed++
        
        const userId = (typeof up.userId === 'object' && up.userId._id 
          ? up.userId._id 
          : up.userId).toString()
        
        // âœ… CORREÃ‡ÃƒO: Type assertion para up._id
        const userProductId = (up._id as mongoose.Types.ObjectId).toString()
        
        const user = userMap.get(userId)
        
        if (!user) {
          console.warn(`   âš ï¸ User ${userId} nÃ£o encontrado`)
          recordsWithoutDates++
          overallSources.unknown++
          continue
        }
        
        try {
          // ðŸ†• Determinar data de venda (com registro de firstSystemEntry)
          const { date: saleDate, source } = await determineSaleDate(up, user)
          
          recordsWithValidDates++
          
          // Atualizar contadores de fonte
          overallSources[source]++
          
          // Atualizar oldest/newest
          if (!oldestSale || saleDate < oldestSale) oldestSale = saleDate
          if (!newestSale || saleDate > newestSale) newestSale = saleDate
          
          // Extrair ano e mÃªs
          const year = saleDate.getFullYear()
          const month = saleDate.getMonth() + 1
          const monthKey = `${year}-${month.toString().padStart(2, '0')}`
          
          // âœ… CORREÃ‡ÃƒO: ComparaÃ§Ã£o usando strings
          const isNewStudent = userFirstProducts.get(userId) === userProductId
          
          
          // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          // AGREGAR POR MÃŠS
          // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          
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
          
          // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          // AGREGAR POR ANO
          // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          
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
          console.error(`   âŒ Erro ao processar UserProduct ${up._id}:`, error)
          recordsWithoutDates++
          overallSources.unknown++
        }
      }
      
      // 2.6. Converter Maps em Arrays
      const salesByMonth = Array.from(monthlyMap.values())
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year
          return a.month - b.month
        })
      
      const salesByYear = Array.from(yearlyMap.values())
        .sort((a, b) => a.year - b.year)
      
      // 2.7. Calcular totais
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
      
      // Calcular Ãºltimos N meses
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
      
      // 2.8. Guardar/Atualizar ProductSalesStats
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
      
      console.log(`   âœ… Stats guardados:`)
      console.log(`      â€¢ Total vendas: ${totals.allTime}`)
      console.log(`      â€¢ Registos processados: ${recordsProcessed}`)
      console.log(`      â€¢ Com datas vÃ¡lidas: ${recordsWithValidDates}`)
      console.log(`      â€¢ Sem datas: ${recordsWithoutDates}`)
      console.log(`      â€¢ Fontes de dados:`)
      console.log(`        - purchaseDate: ${overallSources.purchaseDate}`)
      console.log(`        - joinedDate: ${overallSources.joinedDate}`)
      console.log(`        - enrolledAt: ${overallSources.enrolledAt}`)
      console.log(`        - ðŸ†• firstSystemEntry: ${overallSources.firstSystemEntry}`)
      console.log(`        - unknown: ${overallSources.unknown}`)
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(`\nâœ… Product Sales Stats construÃ­dos com sucesso em ${duration}s`)
    
  } catch (error) {
    console.error('âŒ Erro ao construir Product Sales Stats:', error)
    throw error
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HELPER: OBTER STATS (LEITURA RÃPIDA)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getProductSalesStats(
  requestedLimit?: unknown,
  productId?: string
): Promise<any> {
  try {
    const query = productId ? { productId } : {}
    
    const stats = await ProductSalesStats.find(query)
      .sort({ 'meta.calculatedAt': -1, _id: -1 })
      .limit(boundedQueryLimit(requestedLimit, 200))
      .lean()
    
    return stats
  } catch (error) {
    console.error('âŒ Erro ao buscar Product Sales Stats:', error)
    throw error
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXPORT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default {
  buildProductSalesStats,
  getProductSalesStats
}
