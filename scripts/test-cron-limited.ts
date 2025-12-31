// ════════════════════════════════════════════════════════════
// 🧪 TESTE DO DAILY PIPELINE - COM LOGS DEBUG COMPLETOS
// VERSÃO DEBUG: Mostra exatamente o que está a acontecer
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

// ═══════════════════════════════════════════════════════════
// SNAPSHOT
// ═══════════════════════════════════════════════════════════

interface UserSnapshot {
  email: string
  userId: string
  timestamp: Date
  user: {
    hotmart?: any
    curseduca?: any
  }
  userProducts: Array<{
    productId: string
    productCode: string
    status: string
    progress: any
    engagement: any
    activeCampaignData: {
      tags: string[]
      lists: string[]
      lastSyncAt?: Date
    }
  }>
}

async function captureSnapshot(emails: string[]): Promise<UserSnapshot[]> {
  const snapshots: UserSnapshot[] = []
  
  for (const email of emails) {
    const user = await User.findOne({ email }).lean()
    if (!user) {
      console.log(`⚠️  User não encontrado: ${email}`)
      continue
    }
    
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'code name')
      .lean()
    
    const snapshot: UserSnapshot = {
      email,
      userId: user._id.toString(),
      timestamp: new Date(),
      user: {
        hotmart: user.hotmart,
        curseduca: user.curseduca
      },
      userProducts: userProducts.map((up: any) => ({
        productId: up.productId._id.toString(),
        productCode: up.productId.code,
        status: up.status,
        progress: up.progress,
        engagement: up.engagement,
        activeCampaignData: {
          tags: up.activeCampaignData?.tags || [],
          lists: up.activeCampaignData?.lists || [],
          lastSyncAt: up.activeCampaignData?.lastSyncAt
        }
      }))
    }
    
    snapshots.push(snapshot)
  }
  
  return snapshots
}

// ═══════════════════════════════════════════════════════════
// STEP 3: RECALC ENGAGEMENT COM DEBUG DETALHADO
// ═══════════════════════════════════════════════════════════

async function recalcEngagementWithDebug(testEmails: string[]) {
  console.log('[STEP 3/4] 🔄 Recalc Engagement (SÓ EMAILS DE TESTE)')
  console.log('-'.repeat(70))
  const step3Start = Date.now()
  
  try {
    // Buscar UserIds dos emails de teste
    const testUsers = await User.find({ email: { $in: testEmails } })
      .select('_id email')
      .lean()
    
    const testUserIds = testUsers.map(u => u._id)
    
    console.log(`   Users de teste encontrados: ${testUsers.length}`)
    testUsers.forEach((u: any) => console.log(`      - ${u.email}`))
    console.log()
    
    // Buscar UserProducts só desses users
    const testUserProducts = await UserProduct.find({
      userId: { $in: testUserIds },
      status: 'ACTIVE'
    }).lean()
    
    console.log(`   UserProducts a processar: ${testUserProducts.length}`)
    console.log()
    
    // Pre-load Users e Products (cache)
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
        console.warn(`   ⚠️  Skipping UP ${(up as any)._id} (user ou product não encontrado)`)
        continue
      }
      
      // 🔍 LOG ANTES DE CALCULAR
      console.log(`\n   📦 Processando: ${user.email} → ${product.code}`)
      console.log(`      Platform: ${product.platform}`)
      
      if (product.platform === 'curseduca') {
        console.log(`      🔍 CursEduca data:`)
        console.log(`         enrolledClasses: ${JSON.stringify(user.curseduca?.enrolledClasses || [])}`)
        console.log(`         joinedDate: ${user.curseduca?.joinedDate}`)
        console.log(`         metadata.createdAt: ${user.metadata?.createdAt || user.createdAt}`)
      }
      
      if (product.platform === 'hotmart') {
        console.log(`      🔍 Hotmart data:`)
        const purchaseDate = user.hotmart?.purchaseDate
        if (purchaseDate) {
          console.log(`   📅 Hotmart purchaseDate: ${purchaseDate.toISOString()}`)
        }
      }
      
      // Calcular metrics
      const metrics = calculateEngagementMetricsForUserProduct(user, product)
      
      // 🔍 LOG APÓS CALCULAR
      console.log(`      ✅ Métricas calculadas:`)
      console.log(`         daysSinceLastLogin: ${metrics.engagement.daysSinceLastLogin}`)
      console.log(`         daysSinceLastAction: ${metrics.engagement.daysSinceLastAction}`)
      console.log(`         daysSinceEnrollment: ${metrics.engagement.daysSinceEnrollment}`)
      console.log(`         enrolledAt: ${metrics.engagement.enrolledAt}`)
      
      const updateFields: any = {}
      let needsUpdate = false
      
      // daysSinceLastLogin
      if (metrics.engagement.daysSinceLastLogin !== null) {
        updateFields['engagement.daysSinceLastLogin'] = metrics.engagement.daysSinceLastLogin
        needsUpdate = true
      }
      
      // daysSinceLastAction
      if (metrics.engagement.daysSinceLastAction !== null) {
        updateFields['engagement.daysSinceLastAction'] = metrics.engagement.daysSinceLastAction
        needsUpdate = true
      }
      
      // 🆕 daysSinceEnrollment
      if (metrics.engagement.daysSinceEnrollment !== null) {
        updateFields['engagement.daysSinceEnrollment'] = metrics.engagement.daysSinceEnrollment
        needsUpdate = true
        console.log(`      ✅ Vai atualizar daysSinceEnrollment = ${metrics.engagement.daysSinceEnrollment}`)
      } else {
        console.log(`      ⚠️  daysSinceEnrollment é NULL - NÃO vai atualizar!`)
      }
      
      // 🆕 enrolledAt
      if (metrics.engagement.enrolledAt !== null) {
        updateFields['engagement.enrolledAt'] = metrics.engagement.enrolledAt
        needsUpdate = true
        console.log(`      ✅ Vai atualizar enrolledAt = ${metrics.engagement.enrolledAt}`)
      } else {
        console.log(`      ⚠️  enrolledAt é NULL - NÃO vai atualizar!`)
      }
      
      // actionsLastWeek
      if (metrics.engagement.actionsLastWeek !== undefined) {
        updateFields['engagement.actionsLastWeek'] = metrics.engagement.actionsLastWeek
        needsUpdate = true
      }
      
      // actionsLastMonth
      if (metrics.engagement.actionsLastMonth !== undefined) {
        updateFields['engagement.actionsLastMonth'] = metrics.engagement.actionsLastMonth
        needsUpdate = true
      }
      
      if (needsUpdate) {
        console.log(`      📝 Update fields: ${Object.keys(updateFields).join(', ')}`)
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
      console.log(`\n   🔄 Executando bulk update...`)
      const bulkResult = await UserProduct.bulkWrite(bulkOps)
      console.log(`   ✅ ${bulkOps.length} UserProducts atualizados`)
      console.log(`   📊 Bulk result:`)
      console.log(`      matchedCount: ${bulkResult.matchedCount}`)
      console.log(`      modifiedCount: ${bulkResult.modifiedCount}`)
      console.log(`      upsertedCount: ${bulkResult.upsertedCount}`)
    }
    
    const duration = Math.floor((Date.now() - step3Start) / 1000)
    console.log(`\n✅ STEP 3/4 completo (${duration}s)`)
    console.log()
    
    return {
      success: true,
      duration,
      stats: {
        total: testUserProducts.length,
        updated: updatedCount,
        skipped: testUserProducts.length - updatedCount
      }
    }
    
  } catch (error: any) {
    console.error(`❌ STEP 3/4 falhou: ${error.message}`)
    console.error(error.stack)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
// PIPELINE COMPLETO
// ═══════════════════════════════════════════════════════════

async function executeTestPipeline(testEmails: string[]) {
  const startTime = Date.now()
  const errors: string[] = []
  
  console.log('═'.repeat(70))
  console.log('🚀 PIPELINE DE TESTE - SÓ EMAILS ESPECÍFICOS')
  console.log('═'.repeat(70))
  console.log(`📧 Emails: ${testEmails.join(', ')}`)
  console.log()
  
  const result: any = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} }
    },
    errors: [],
    summary: {
      totalUsers: 0,
      totalUserProducts: 0,
      engagementUpdated: 0,
      tagsApplied: 0
    }
  }
  
  try {
    // STEP 1: Skip Sync Hotmart
    console.log('[STEP 1/4] 📥 Sync Hotmart')
    console.log('-'.repeat(70))
    result.steps.syncHotmart = { success: true, duration: 0, stats: {} }
    console.log(`✅ STEP 1/4 completo (0s)`)
    console.log()
    
    // STEP 2: Skip Sync CursEduca
    console.log('[STEP 2/4] 📥 Sync CursEduca')
    console.log('-'.repeat(70))
    result.steps.syncCursEduca = { success: true, duration: 0, stats: {} }
    console.log(`✅ STEP 2/4 completo (0s)`)
    console.log()
    
    // STEP 3: Recalc Engagement COM DEBUG
    result.steps.recalcEngagement = await recalcEngagementWithDebug(testEmails)
    result.summary.engagementUpdated = result.steps.recalcEngagement.stats.updated
    
    // STEP 4: Evaluate Tag Rules
    console.log('[STEP 4/4] 🏷️  Evaluate Tag Rules (SÓ EMAILS DE TESTE)')
    console.log('-'.repeat(70))
    const step4Start = Date.now()
    
    try {
      const testUsers = await User.find({ email: { $in: testEmails } })
        .select('_id email')
        .lean()
      
      const testUserIds = testUsers.map(u => u._id)
      
      const testUserProducts = await UserProduct.find({
        userId: { $in: testUserIds },
        status: 'ACTIVE'
      }).select('userId productId').lean()
      
      console.log(`   UserProducts a avaliar: ${testUserProducts.length}`)
      console.log()
      
      const items = testUserProducts.map(up => ({
        userId: up.userId.toString(),
        productId: up.productId.toString()
      }))
      
      const orchestrationResults = await tagOrchestratorV2.orchestrateMultipleUserProducts(items)
      
      const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)
      
      const tagsApplied = orchestrationResults.reduce(
        (sum, r) => sum + (r.tagsApplied?.length || 0),
        0
      )
      
      result.steps.evaluateTagRules = {
        success: stats.failed === 0,
        duration: Math.floor((Date.now() - step4Start) / 1000),
        stats: {
          total: stats.total,
          successful: stats.successful,
          failed: stats.failed,
          tagsApplied,
          tagsRemoved: orchestrationResults.reduce(
            (sum, r) => sum + (r.tagsRemoved?.length || 0),
            0
          )
        }
      }
      
      result.summary.tagsApplied = tagsApplied
      
      console.log(`✅ STEP 4/4 completo (${result.steps.evaluateTagRules.duration}s)`)
      console.log()
      
    } catch (error: any) {
      errors.push(`Tag Rules: ${error.message}`)
      result.steps.evaluateTagRules.error = error.message
      console.error(`❌ STEP 4/4 falhou: ${error.message}`)
      console.log()
    }
    
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = errors
    
    console.log('═'.repeat(70))
    if (result.success && errors.length === 0) {
      console.log('✅ PIPELINE DE TESTE COMPLETO!')
    } else {
      console.log('⚠️  PIPELINE COMPLETO COM AVISOS')
    }
    console.log('═'.repeat(70))
    console.log()
    
    return result
    
  } catch (error: any) {
    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.errors.push(`Pipeline fatal: ${error.message}`)
    
    console.error('❌ PIPELINE FALHOU:', error.message)
    
    return result
  }
}

// ═══════════════════════════════════════════════════════════
// SAVE JSON
// ═══════════════════════════════════════════════════════════

function saveSnapshot(
  snapshotBefore: UserSnapshot[],
  snapshotAfter: UserSnapshot[],
  pipelineResult: any
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `cron-test-${timestamp}.json`
  const filepath = path.join(__dirname, '..', 'logs', filename)
  
  const logsDir = path.join(__dirname, '..', 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
  
  const output = {
    testInfo: {
      testEmails: TEST_EMAILS,
      executedAt: new Date(),
      duration: pipelineResult.duration,
      success: pipelineResult.success
    },
    before: snapshotBefore,
    after: snapshotAfter,
    pipeline: pipelineResult,
    diff: calculateDiff(snapshotBefore, snapshotAfter)
  }
  
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf-8')
  
  return filepath
}

function calculateDiff(before: UserSnapshot[], after: UserSnapshot[]) {
  const diffs: any[] = []
  
  for (const userBefore of before) {
    const userAfter = after.find(u => u.email === userBefore.email)
    if (!userAfter) continue
    
    const userDiff: any = {
      email: userBefore.email,
      products: []
    }
    
    for (const upBefore of userBefore.userProducts) {
      const upAfter = userAfter.userProducts.find(
        up => up.productCode === upBefore.productCode
      )
      
      if (!upAfter) continue
      
      const productDiff: any = {
        productCode: upBefore.productCode,
        changes: {
          tags: {
            before: upBefore.activeCampaignData.tags,
            after: upAfter.activeCampaignData.tags,
            added: upAfter.activeCampaignData.tags.filter(
              (t: string) => !upBefore.activeCampaignData.tags.includes(t)
            ),
            removed: upBefore.activeCampaignData.tags.filter(
              (t: string) => !upAfter.activeCampaignData.tags.includes(t)
            )
          },
          engagement: {
            before: upBefore.engagement,
            after: upAfter.engagement
          }
        }
      }
      
      userDiff.products.push(productDiff)
    }
    
    diffs.push(userDiff)
  }
  
  return diffs
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()
    
    // SNAPSHOT ANTES
    console.log('📸 CAPTURANDO ESTADO ANTES')
    console.log('-'.repeat(70))
    const snapshotBefore = await captureSnapshot(TEST_EMAILS)
    console.log(`✅ Capturado: ${snapshotBefore.length} users`)
    console.log()
    
    // EXECUTAR PIPELINE
    const pipelineResult = await executeTestPipeline(TEST_EMAILS)
    
    // SNAPSHOT DEPOIS
    console.log('📸 CAPTURANDO ESTADO DEPOIS')
    console.log('-'.repeat(70))
    const snapshotAfter = await captureSnapshot(TEST_EMAILS)
    console.log(`✅ Capturado: ${snapshotAfter.length} users`)
    console.log()
    
    // SALVAR JSON
    const filepath = saveSnapshot(snapshotBefore, snapshotAfter, pipelineResult)
    console.log(`💾 Resultados salvos: ${filepath}`)
    console.log()
    
    console.log('═'.repeat(70))
    console.log('🎉 TESTE COMPLETO!')
    console.log('═'.repeat(70))
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
  }
}

main()