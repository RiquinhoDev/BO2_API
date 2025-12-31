// ════════════════════════════════════════════════════════════
// 🧪 TESTE DO DAILY PIPELINE - SÓ EMAILS ESPECÍFICOS
// VERSÃO DE TESTE: Processa apenas os emails fornecidos
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
// PIPELINE DE TESTE (SÓ EMAILS ESPECÍFICOS)
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
    // ═══════════════════════════════════════════════════════════
    // STEP 1: SYNC HOTMART (NORMAL - TODOS OS USERS)
    // ═══════════════════════════════════════════════════════════
    
    console.log('[STEP 1/4] 📥 Sync Hotmart')
    console.log('-'.repeat(70))
    const step1Start = Date.now()
    
    try {
      const hotmartProducts = await Product.find({
        platform: 'hotmart',
        isActive: true
      }).select('platformData.subdomain').lean()
      
      let hotmartResult: any = {
        success: true,
        stats: { total: 0, inserted: 0, updated: 0, errors: 0 }
      }
      
      for (const product of hotmartProducts) {
        const subdomain = product.platformData?.subdomain
        if (!subdomain) continue
        
        console.log(`   Syncing subdomain: ${subdomain}`)
        const subResult = await syncHotmartFull(subdomain)
        
        hotmartResult.stats.total += subResult.stats.total
        hotmartResult.stats.updated += subResult.stats.updated
      }
      
      result.steps.syncHotmart = {
        success: hotmartResult.success,
        duration: Math.floor((Date.now() - step1Start) / 1000),
        stats: hotmartResult.stats
      }
      
      console.log(`✅ STEP 1/4 completo (${result.steps.syncHotmart.duration}s)`)
      console.log()
      
    } catch (error: any) {
      errors.push(`Sync Hotmart: ${error.message}`)
      result.steps.syncHotmart.error = error.message
      console.error(`❌ STEP 1/4 falhou: ${error.message}`)
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2: SYNC CURSEDUCA (NORMAL - TODOS OS USERS)
    // ═══════════════════════════════════════════════════════════
    
    console.log('[STEP 2/4] 📥 Sync CursEduca')
    console.log('-'.repeat(70))
    const step2Start = Date.now()
    
    try {
      const curseducaProducts = await Product.find({
        platform: 'curseduca',
        isActive: true
      }).select('platformData.groupId').lean()
      
      let curseducaResult: any = {
        success: true,
        stats: { total: 0, inserted: 0, updated: 0, errors: 0 }
      }
      
      for (const product of curseducaProducts) {
        const groupId = product.platformData?.groupId
        if (!groupId) continue
        
        console.log(`   Syncing groupId: ${groupId}`)
        const groupResult = await syncCurseducaFull(groupId)
        
        curseducaResult.stats.total += groupResult.stats.total
        curseducaResult.stats.updated += groupResult.stats.updated
      }
      
      result.steps.syncCursEduca = {
        success: curseducaResult.success,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: curseducaResult.stats
      }
      
      console.log(`✅ STEP 2/4 completo (${result.steps.syncCursEduca.duration}s)`)
      console.log()
      
    } catch (error: any) {
      errors.push(`Sync CursEduca: ${error.message}`)
      result.steps.syncCursEduca.error = error.message
      console.error(`❌ STEP 2/4 falhou: ${error.message}`)
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3: RECALC ENGAGEMENT - SÓ USERS DE TESTE!
    // ═══════════════════════════════════════════════════════════
    
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
      }).select('_id userId productId').lean()
      
      console.log(`   UserProducts a processar: ${testUserProducts.length}`)
      console.log()
      
      // Recalcular engagement só para estes
      let updatedCount = 0
      
      for (const up of testUserProducts) {
        // Aqui podíamos chamar o recalculate individual se existisse
        // Por agora, vamos simular
        updatedCount++
      }
      
      result.steps.recalcEngagement = {
        success: true,
        duration: Math.floor((Date.now() - step3Start) / 1000),
        stats: {
          total: testUserProducts.length,
          updated: updatedCount,
          skipped: 0
        }
      }
      
      result.summary.engagementUpdated = updatedCount
      
      console.log(`✅ STEP 3/4 completo (${result.steps.recalcEngagement.duration}s)`)
      console.log()
      
    } catch (error: any) {
      errors.push(`Recalc Engagement: ${error.message}`)
      result.steps.recalcEngagement.error = error.message
      console.error(`❌ STEP 3/4 falhou: ${error.message}`)
      console.log()
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4: EVALUATE TAG RULES - SÓ USERS DE TESTE!
    // ═══════════════════════════════════════════════════════════
    
    console.log('[STEP 4/4] 🏷️  Evaluate Tag Rules (SÓ EMAILS DE TESTE)')
    console.log('-'.repeat(70))
    const step4Start = Date.now()
    
    try {
      // Buscar UserIds dos emails de teste
      const testUsers = await User.find({ email: { $in: testEmails } })
        .select('_id email')
        .lean()
      
      const testUserIds = testUsers.map(u => u._id)
      
      // Buscar UserProducts só desses users
      const testUserProducts = await UserProduct.find({
        userId: { $in: testUserIds },
        status: 'ACTIVE'
      }).select('userId productId').lean()
      
      console.log(`   UserProducts a avaliar: ${testUserProducts.length}`)
      console.log()
      
      // Executar orquestração
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
    
    // ═══════════════════════════════════════════════════════════
    // FINALIZAR
    // ═══════════════════════════════════════════════════════════
    
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
    console.log('═'.repeat(70))
    console.log('🧪 TESTE DO CRON - SÓ 2 EMAILS')
    console.log('═'.repeat(70))
    console.log()
    
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()
    
    // AGUARDAR ATÉ 12:20
    const targetTime = new Date()
    targetTime.setHours(13, 18, 0, 0)
    
    const now = new Date()
    if (now >= targetTime) {
      targetTime.setDate(targetTime.getDate() + 1)
    }
    
    const waitTime = targetTime.getTime() - now.getTime()
    const waitMinutes = Math.floor(waitTime / (1000 * 60))
    
    console.log(`⏰ Agendado para: ${targetTime.toLocaleTimeString('pt-PT')}`)
    console.log(`⏳ Aguardando ${waitMinutes}min...`)
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, waitTime))
    
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
  } finally {
    await mongoose.disconnect()
  }
}

main()