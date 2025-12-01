// ════════════════════════════════════════════════════════════
// 📁 src/services/productSalesStatsBuilder.service.ts
// SERVICE: Construtor de Estatísticas de Vendas por Produto
// ════════════════════════════════════════════════════════════

import ProductSalesStats, { 
  IMonthlySales, 
  IYearlySales,
  IDateSourceBreakdown,
  DateSourceType
} from '../models/ProductSalesStats'
import UserProduct from '../models/UserProduct'
import Product from '../models/Product'
import User from '../models/user'
import mongoose from 'mongoose'

// ─────────────────────────────────────────────────────────────
// HELPER: REGISTAR PRIMEIRA ENTRADA NO SISTEMA
// ─────────────────────────────────────────────────────────────

async function ensureFirstSystemEntry(userId: mongoose.Types.ObjectId): Promise<Date> {
  const user = await User.findById(userId)
  
  if (!user) {
    console.warn(`⚠️ User ${userId} não encontrado`)
    return new Date()
  }
  
  // 🆕 SE JÁ TEM firstSystemEntry, retornar
  if (user.metadata?.firstSystemEntry) {
    return user.metadata.firstSystemEntry
  }
  
  // 🆕 CALCULAR primeira entrada baseado em dados disponíveis
  const possibleDates: Date[] = []
  
  // Hotmart
  if (user.hotmart?.purchaseDate) possibleDates.push(new Date(user.hotmart.purchaseDate))
  if (user.hotmart?.signupDate) possibleDates.push(new Date(user.hotmart.signupDate))
  if (user.hotmart?.firstAccessDate) possibleDates.push(new Date(user.hotmart.firstAccessDate))
  
  // CursEduca
  if (user.curseduca?.joinedDate) possibleDates.push(new Date(user.curseduca.joinedDate))
  if (user.curseduca?.enrolledClasses?.[0]?.enteredAt) {
    possibleDates.push(new Date(user.curseduca.enrolledClasses[0].enteredAt))
  }
  
  // Discord
  if (user.discord?.createdAt) possibleDates.push(new Date(user.discord.createdAt))
  
  // Metadata
  if (user.metadata?.createdAt) possibleDates.push(new Date(user.metadata.createdAt))
  
  // UserProducts (buscar enrolledAt mais antigo)
  const userProducts = await UserProduct.find({ userId }).sort({ enrolledAt: 1 }).limit(1)
  if (userProducts.length > 0 && userProducts[0].enrolledAt) {
    possibleDates.push(new Date(userProducts[0].enrolledAt))
  }
  
  // 🆕 DETERMINAR a data MAIS ANTIGA
  const firstEntry = possibleDates.length > 0
    ? new Date(Math.min(...possibleDates.map(d => d.getTime())))
    : new Date()
  
  // 🆕 GUARDAR no User
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'metadata.firstSystemEntry': firstEntry
      }
    }
  )
  
  console.log(`✅ Registada primeira entrada para user ${userId}: ${firstEntry.toISOString()}`)
  
  return firstEntry
}

// ─────────────────────────────────────────────────────────────
// HELPER: DETERMINAR DATA DE COMPRA/ADESÃO
// ─────────────────────────────────────────────────────────────

async function determineSaleDate(
  userProduct: any,
  user: any
): Promise<{ date: Date; source: DateSourceType }> {
  const platform = userProduct.platform
  
  // HOTMART: purchaseDate > enrolledAt > signupDate > firstSystemEntry
  if (platform === 'hotmart') {
    if (user.hotmart?.purchaseDate) {
      return {
        date: new Date(user.hotmart.purchaseDate),
        source: 'purchaseDate'
      }
    }
    
    if (userProduct.enrolledAt) {
      return {
        date: new Date(userProduct.enrolledAt),
        source: 'enrolledAt'
      }
    }
    
    if (user.hotmart?.signupDate) {
      return {
        date: new Date(user.hotmart.signupDate),
        source: 'purchaseDate' // Consideramos signup como compra
      }
    }
    
    // 🆕 FALLBACK: Primeira entrada no sistema
    if (user.metadata?.firstSystemEntry) {
      return {
        date: new Date(user.metadata.firstSystemEntry),
        source: 'firstSystemEntry'
      }
    }
  }
  
  // CURSEDUCA: joinedDate > enrolledAt > enteredAt > firstSystemEntry
  if (platform === 'curseduca') {
    if (user.curseduca?.joinedDate) {
      return {
        date: new Date(user.curseduca.joinedDate),
        source: 'joinedDate'
      }
    }
    
    if (userProduct.enrolledAt) {
      return {
        date: new Date(userProduct.enrolledAt),
        source: 'enrolledAt'
      }
    }
    
    if (user.curseduca?.enrolledClasses?.[0]?.enteredAt) {
      return {
        date: new Date(user.curseduca.enrolledClasses[0].enteredAt),
        source: 'joinedDate'
      }
    }
    
    // 🆕 FALLBACK: Primeira entrada no sistema
    if (user.metadata?.firstSystemEntry) {
      return {
        date: new Date(user.metadata.firstSystemEntry),
        source: 'firstSystemEntry'
      }
    }
  }
  
  // DISCORD: enrolledAt > joinedServer > firstSystemEntry > createdAt
  if (platform === 'discord') {
    if (userProduct.enrolledAt) {
      return {
        date: new Date(userProduct.enrolledAt),
        source: 'enrolledAt'
      }
    }
    
    // Discord joinedAt (entrada no servidor Discord)
    if (user.discord?.joinedAt) {
      return {
        date: new Date(user.discord.joinedAt),
        source: 'joinedServer'
      }
    }
    
    // 🆕 FALLBACK: Primeira entrada no sistema
    if (user.metadata?.firstSystemEntry) {
      return {
        date: new Date(user.metadata.firstSystemEntry),
        source: 'firstSystemEntry'
      }
    }
    
    if (user.discord?.createdAt) {
      return {
        date: new Date(user.discord.createdAt),
        source: 'createdAt'
      }
    }
  }
  
  // 🆕 FALLBACK UNIVERSAL: Registar e usar firstSystemEntry
  const firstEntry = await ensureFirstSystemEntry(userProduct.userId)
  
  return {
    date: firstEntry,
    source: 'firstSystemEntry'
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN: CONSTRUIR STATS DE VENDAS
// ─────────────────────────────────────────────────────────────

export async function buildProductSalesStats(): Promise<void> {
  console.log('\n🏗️ ========================================')
  console.log('🏗️ CONSTRUINDO PRODUCT SALES STATS')
  console.log('🏗️ ========================================\n')
  
  const startTime = Date.now()
  
  try {
    // 1. Buscar todos os produtos
    const products = await Product.find({ isActive: true })
    console.log(`📦 ${products.length} produtos ativos encontrados\n`)
    
    // 2. Processar cada produto
    for (const product of products) {
      console.log(`\n📊 Processando produto: ${product.code} (${product.name})`)
      
      // 2.1. Buscar UserProducts deste produto
      const userProducts = await UserProduct.find({ 
        productId: product._id 
      }).populate('userId').lean()
      
      console.log(`   ✅ ${userProducts.length} UserProducts encontrados`)
      
      if (userProducts.length === 0) {
        console.log(`   ⏭️  Pulando produto sem vendas`)
        continue
      }
      
      // 2.2. Estruturas de agregação
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
      
      // 2.4. Determinar quais users são "novos" (primeiro produto)
      const userFirstProducts = new Map<string, mongoose.Types.ObjectId>()
      
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
            userFirstProducts.set(userId, allUserProducts[0]._id)
          }
        }
      }
      
      // 2.5. Processar cada UserProduct
      for (const up of userProducts) {
        recordsProcessed++
        
        const userId = (typeof up.userId === 'object' && up.userId._id 
          ? up.userId._id 
          : up.userId).toString()
        
        const user = userMap.get(userId)
        
        if (!user) {
          console.warn(`   ⚠️ User ${userId} não encontrado`)
          recordsWithoutDates++
          overallSources.unknown++
          continue
        }
        
        try {
          // 🆕 Determinar data de venda (com registro de firstSystemEntry)
          const { date: saleDate, source } = await determineSaleDate(up, user)
          
          recordsWithValidDates++
          
          // Atualizar contadores de fonte
          overallSources[source]++
          
          // Atualizar oldest/newest
          if (!oldestSale || saleDate < oldestSale) oldestSale = saleDate
          if (!newestSale || saleDate > newestSale) newestSale = saleDate
          
          // Extrair ano e mês
          const year = saleDate.getFullYear()
          const month = saleDate.getMonth() + 1
          const monthKey = `${year}-${month.toString().padStart(2, '0')}`
          
          // Verificar se é novo estudante (primeiro produto)
          const isNewStudent = userFirstProducts.get(userId)?.toString() === up._id.toString()
          
          // ────────────────────────────────────────────────
          // AGREGAR POR MÊS
          // ────────────────────────────────────────────────
          
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
          
          // ────────────────────────────────────────────────
          // AGREGAR POR ANO
          // ────────────────────────────────────────────────
          
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
          console.error(`   ❌ Erro ao processar UserProduct ${up._id}:`, error)
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
      
      // Calcular últimos N meses
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
      
      console.log(`   ✅ Stats guardados:`)
      console.log(`      • Total vendas: ${totals.allTime}`)
      console.log(`      • Registos processados: ${recordsProcessed}`)
      console.log(`      • Com datas válidas: ${recordsWithValidDates}`)
      console.log(`      • Sem datas: ${recordsWithoutDates}`)
      console.log(`      • Fontes de dados:`)
      console.log(`        - purchaseDate: ${overallSources.purchaseDate}`)
      console.log(`        - joinedDate: ${overallSources.joinedDate}`)
      console.log(`        - enrolledAt: ${overallSources.enrolledAt}`)
      console.log(`        - 🆕 firstSystemEntry: ${overallSources.firstSystemEntry}`)
      console.log(`        - unknown: ${overallSources.unknown}`)
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(`\n✅ Product Sales Stats construídos com sucesso em ${duration}s`)
    
  } catch (error) {
    console.error('❌ Erro ao construir Product Sales Stats:', error)
    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: OBTER STATS (LEITURA RÁPIDA)
// ─────────────────────────────────────────────────────────────

export async function getProductSalesStats(
  productId?: string
): Promise<any> {
  try {
    const query = productId ? { productId } : {}
    
    const stats = await ProductSalesStats.find(query)
      .sort({ 'meta.calculatedAt': -1 })
      .lean()
    
    return stats
  } catch (error) {
    console.error('❌ Erro ao buscar Product Sales Stats:', error)
    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export default {
  buildProductSalesStats,
  getProductSalesStats
}