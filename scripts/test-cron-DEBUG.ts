// ════════════════════════════════════════════════════════════
// 🧪 TESTE DO DAILY PIPELINE - COM LOGS DEBUG
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'
import { tagOrchestratorV2 } from '../src/services/ac/tagOrchestrator.service'
import { syncHotmartFull } from '../src/services/syncUtilziadoresServices/hotmartServices/hotmartSync.service'
import { syncCurseducaFull } from '../src/services/syncUtilziadoresServices/curseducaServices/curseducaSync.service'
import { calculateEngagementMetricsForUserProduct } from '../src/services/syncUtilziadoresServices/universalSyncService'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

const TEST_EMAILS = [
  'joaomcf37@gmail.com',
  'rui.santos@serriquinho.com'
]

console.clear()

// STEP 3: RECALC ENGAGEMENT COM DEBUG
async function recalcEngagementWithDebug(testEmails: string[]) {
  console.log('[STEP 3/4] 🔄 Recalc Engagement (SÓ EMAILS DE TESTE)')
  console.log('-'.repeat(70))
  
  const testUsers = await User.find({ email: { $in: testEmails } })
    .select('_id email')
    .lean()
  
  const testUserIds = testUsers.map(u => u._id)
  
  console.log(`   Users de teste encontrados: ${testUsers.length}`)
  testUsers.forEach((u: any) => console.log(`      - ${u.email}`))
  console.log()
  
  const testUserProducts = await UserProduct.find({
    userId: { $in: testUserIds },
    status: 'ACTIVE'
  }).lean()
  
  console.log(`   UserProducts a processar: ${testUserProducts.length}`)
  console.log()
  
  // Pre-load cache
  const usersMap = new Map()
  const productsMap = new Map()
  
  const allUsers = await User.find({ _id: { $in: testUserIds } }).lean()
  allUsers.forEach((u: any) => usersMap.set(u._id.toString(), u))
  
  const productIds = [...new Set(testUserProducts.map((up: any) => up.productId.toString()))]
  const allProducts = await Product.find({ _id: { $in: productIds } }).lean()
  allProducts.forEach((p: any) => productsMap.set(p._id.toString(), p))
  
  console.log(`   Cache criado: ${usersMap.size} users, ${productsMap.size} products`)
  console.log()
  
  const bulkOps: any[] = []
  let updatedCount = 0
  
  for (const up of testUserProducts) {
    const user = usersMap.get((up as any).userId.toString())
    const product = productsMap.get((up as any).productId.toString())
    
    if (!user || !product) {
      console.warn(`   ⚠️  Skipping UP ${(up as any)._id}`)
      continue
    }
    
    // 🔍 DEBUG: Log antes de calcular
    console.log(`\n   📦 Processando: ${user.email} → ${product.code}`)
    console.log(`      Platform: ${product.platform}`)
    
    if (product.platform === 'curseduca') {
      console.log(`      🔍 CursEduca data:`)
      console.log(`         enrolledClasses: ${JSON.stringify(user.curseduca?.enrolledClasses || [])}`)
      console.log(`         joinedDate: ${user.curseduca?.joinedDate}`)
      console.log(`         metadata.createdAt: ${user.metadata?.createdAt || user.createdAt}`)
    }
    
    // Calcular metrics
    const metrics = calculateEngagementMetricsForUserProduct(user, product)
    
    // 🔍 DEBUG: Log APÓS calcular
    console.log(`      ✅ Métricas calculadas:`)
    console.log(`         daysSinceLastLogin: ${metrics.engagement.daysSinceLastLogin}`)
    console.log(`         daysSinceLastAction: ${metrics.engagement.daysSinceLastAction}`)
    console.log(`         daysSinceEnrollment: ${metrics.engagement.daysSinceEnrollment}`)
    console.log(`         enrolledAt: ${metrics.engagement.enrolledAt}`)
    
    const updateFields: any = {}
    let needsUpdate = false
    
    if (metrics.engagement.daysSinceLastLogin !== null) {
      updateFields['engagement.daysSinceLastLogin'] = metrics.engagement.daysSinceLastLogin
      needsUpdate = true
    }
    
    if (metrics.engagement.daysSinceLastAction !== null) {
      updateFields['engagement.daysSinceLastAction'] = metrics.engagement.daysSinceLastAction
      needsUpdate = true
    }
    
    if (metrics.engagement.daysSinceEnrollment !== null) {
      updateFields['engagement.daysSinceEnrollment'] = metrics.engagement.daysSinceEnrollment
      needsUpdate = true
      console.log(`      ✅ Vai atualizar daysSinceEnrollment = ${metrics.engagement.daysSinceEnrollment}`)
    } else {
      console.log(`      ⚠️  daysSinceEnrollment é NULL - NÃO vai atualizar!`)
    }
    
    if (metrics.engagement.enrolledAt !== null) {
      updateFields['engagement.enrolledAt'] = metrics.engagement.enrolledAt
      needsUpdate = true
      console.log(`      ✅ Vai atualizar enrolledAt = ${metrics.engagement.enrolledAt}`)
    } else {
      console.log(`      ⚠️  enrolledAt é NULL - NÃO vai atualizar!`)
    }
    
    if (metrics.engagement.actionsLastWeek !== undefined) {
      updateFields['engagement.actionsLastWeek'] = metrics.engagement.actionsLastWeek
      needsUpdate = true
    }
    
    if (metrics.engagement.actionsLastMonth !== undefined) {
      updateFields['engagement.actionsLastMonth'] = metrics.engagement.actionsLastMonth
      needsUpdate = true
    }
    
    if (needsUpdate) {
      console.log(`      📝 Update fields:`, Object.keys(updateFields))
      bulkOps.push({
        updateOne: {
          filter: { _id: (up as any)._id },
          update: { $set: updateFields }
        }
      })
      updatedCount++
    }
  }
  
  // Executar bulk update
  if (bulkOps.length > 0) {
    await UserProduct.bulkWrite(bulkOps)
    console.log(`\n   ✅ ${bulkOps.length} UserProducts atualizados`)
  }
  
  console.log(`\n✅ STEP 3/4 completo`)
  console.log()
  
  return { updated: updatedCount }
}

async function main() {
  try {
    console.log('═'.repeat(70))
    console.log('🧪 TESTE COM DEBUG - SÓ STEP 3')
    console.log('═'.repeat(70))
    console.log()
    
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()
    
    // SÓ EXECUTAR STEP 3 COM DEBUG
    await recalcEngagementWithDebug(TEST_EMAILS)
    
    console.log('═'.repeat(70))
    console.log('🎉 DEBUG COMPLETO!')
    console.log('═'.repeat(70))
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
  }
}

main()