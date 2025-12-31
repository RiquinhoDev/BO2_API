// ════════════════════════════════════════════════════════════
// 🧪 TESTE DO DAILY PIPELINE - USER ESPECÍFICO
// Testa o pipeline completo para 1 user com logs detalhados
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
import Course from '../src/models/Course'
import tagOrchestratorV2 from '../src/services/ac/tagOrchestrator.service'
import { recalculateAllEngagementMetrics } from '../src/services/ac/recalculate-engagement-metrics'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
const DB_NAME = process.env.DB_NAME!

// ═══════════════════════════════════════════════════════════
// LOGGER PARA FICHEIRO
// ═══════════════════════════════════════════════════════════

const LOG_FILE = path.resolve(__dirname, `../logs/pipeline-test-${Date.now()}.log`)

// Criar pasta logs se não existir
const logsDir = path.dirname(LOG_FILE)
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logLine = data 
    ? `[${timestamp}] ${message}\n${JSON.stringify(data, null, 2)}\n`
    : `[${timestamp}] ${message}\n`
  
  // Console
  console.log(message)
  if (data) console.log(JSON.stringify(data, null, 2))
  
  // Ficheiro
  fs.appendFileSync(LOG_FILE, logLine)
}

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const TEST_EMAIL = 'joaomcf37@gmail.com'

console.clear()
log('═'.repeat(70))
log('🧪 TESTE DO DAILY PIPELINE - USER ESPECÍFICO')
log('═'.repeat(70))
log('')
log(`📧 Email de teste: ${TEST_EMAIL}`)
log(`📝 Log file: ${LOG_FILE}`)
log('')

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

async function captureUserState(userId: string, label: string) {
  log(`\n📸 ${label}`)
  log('─'.repeat(70))

  const user = await User.findById(userId).lean()
  const userProducts = await UserProduct.find({ userId }).lean()

  const state = {
    user: {
      email: user?.email,
      name: user?.name,
      hotmart: user?.hotmart,
      curseduca: user?.curseduca
    },
    userProducts: userProducts.map(up => ({
      productId: up.productId,
      status: up.status,
      isPrimary: up.isPrimary,
      progress: up.progress,
      engagement: up.engagement,
      activeCampaignData: up.activeCampaignData,
      reengagement: up.reengagement
    }))
  }

  log(`User ID: ${userId}`)
  log(`UserProducts: ${userProducts.length}`, state)

  return state
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now()

  try {
    // ═══════════════════════════════════════════════════════════
    // CONECTAR À BD
    // ═══════════════════════════════════════════════════════════

    log('\n📡 Conectando à BD...')
    await mongoose.connect(MONGO_URL)
    log('✅ Conectado ao MongoDB')

    // ═══════════════════════════════════════════════════════════
    // STEP 1: BUSCAR USER
    // ═══════════════════════════════════════════════════════════

    log('\n═'.repeat(70))
    log('STEP 1: BUSCAR USER')
    log('═'.repeat(70))

    const user = await User.findOne({ email: TEST_EMAIL })

    if (!user) {
      log(`❌ User ${TEST_EMAIL} não encontrado!`)
      return
    }

    log(`✅ User encontrado: ${user._id}`)

    // Capturar estado ANTES
    const stateBefore = await captureUserState(user.id.toString(), 'ESTADO ANTES DO PIPELINE')

    // ═══════════════════════════════════════════════════════════
    // STEP 2: BUSCAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════

    log('\n═'.repeat(70))
    log('STEP 2: BUSCAR USERPRODUCTS')
    log('═'.repeat(70))

    const userProducts = await UserProduct.find({ userId: user._id })

    log(`📦 ${userProducts.length} UserProducts encontrados:`)

    for (const up of userProducts) {
      const product = await Product.findById(up.productId)
      
      log(`\n   📦 ${product?.code || 'UNKNOWN'}`)
      log(`      ID: ${up._id}`)
      log(`      Status: ${up.status}`)
      log(`      isPrimary: ${up.isPrimary}`)
      log(`      Progress: ${up.progress?.percentage || 0}%`)
      log(`      Engagement:`, {
        daysSinceLastLogin: up.engagement?.daysSinceLastLogin,
        daysSinceLastAction: up.engagement?.daysSinceLastAction,
        engagementScore: up.engagement?.engagementScore
      })
      log(`      Tags AC:`, up.activeCampaignData?.tags || [])
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 3: RECALCULAR ENGAGEMENT (SÓ PARA ESTE USER)
    // ═══════════════════════════════════════════════════════════

    log('\n═'.repeat(70))
    log('STEP 3: RECALCULAR ENGAGEMENT')
    log('═'.repeat(70))

    log('⏭️  Skipping - engagement já calculado no sync')
    log('   (Se quiseres forçar recálculo, descomenta o código)')

    /*
    // Descomenta isto se quiseres forçar recálculo:
    log('🔄 Recalculando engagement metrics...')
    
    const engagementResult = await recalculateAllEngagementMetrics()
    
    log(`✅ Engagement recalculado:`, {
      total: engagementResult.stats.total,
      updated: engagementResult.stats.updated,
      errors: engagementResult.stats.errors
    })
    */

    // Recarregar UserProducts após recálculo
    const userProductsAfterEngagement = await UserProduct.find({ userId: user._id })

    for (const up of userProductsAfterEngagement) {
      const product = await Product.findById(up.productId)
      
      log(`\n   📊 ${product?.code || 'UNKNOWN'} - Engagement atualizado:`, {
        daysSinceLastLogin: up.engagement?.daysSinceLastLogin,
        daysSinceLastAction: up.engagement?.daysSinceLastAction,
        engagementScore: up.engagement?.engagementScore,
        actionsLastWeek: up.engagement?.actionsLastWeek,
        actionsLastMonth: up.engagement?.actionsLastMonth
      })
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: AVALIAR E APLICAR TAGS (TAG ORCHESTRATOR)
    // ═══════════════════════════════════════════════════════════

    log('\n═'.repeat(70))
    log('STEP 4: AVALIAR E APLICAR TAGS')
    log('═'.repeat(70))

    const orchestrationResults = []

    for (const up of userProductsAfterEngagement) {
      const product = await Product.findById(up.productId)
      
      log(`\n🏷️  Orquestrando tags para: ${product?.code || 'UNKNOWN'}`)
      log('─'.repeat(70))

      try {
        const result = await tagOrchestratorV2.orchestrateUserProduct(
          user.id.toString(),
          up.productId.toString()
        )

        orchestrationResults.push(result)

        log(`\n📊 Resultado da orquestração:`, {
          productCode: result.productCode,
          tagsApplied: result.tagsApplied,
          tagsRemoved: result.tagsRemoved,
          communicationsTriggered: result.communicationsTriggered,
          success: result.success,
          error: result.error
        })

        if (result.tagsApplied.length > 0) {
          log(`\n   ✅ Tags aplicadas:`)
          for (const tag of result.tagsApplied) {
            log(`      + ${tag}`)
          }
        }

        if (result.tagsRemoved.length > 0) {
          log(`\n   🗑️  Tags removidas:`)
          for (const tag of result.tagsRemoved) {
            log(`      - ${tag}`)
          }
        }

        if (result.tagsApplied.length === 0 && result.tagsRemoved.length === 0) {
          log(`\n   ⏭️  Sem alterações (tags já corretas)`)
        }

      } catch (error: any) {
        log(`\n   ❌ Erro na orquestração: ${error.message}`)
        log(`   Stack:`, error.stack)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 5: VALIDAR ESTADO FINAL
    // ═══════════════════════════════════════════════════════════

    log('\n═'.repeat(70))
    log('STEP 5: VALIDAR ESTADO FINAL')
    log('═'.repeat(70))

    // Capturar estado DEPOIS
    const stateAfter = await captureUserState(user.id.toString(), 'ESTADO DEPOIS DO PIPELINE')

    // Comparar estados
    log('\n📊 COMPARAÇÃO DE ESTADOS:')
    log('─'.repeat(70))

    for (let i = 0; i < stateBefore.userProducts.length; i++) {
      const before = stateBefore.userProducts[i]
      const after = stateAfter.userProducts[i]

      const product = await Product.findById(before.productId)

      log(`\n📦 ${product?.code || 'UNKNOWN'}:`)

      // Tags
      const tagsBefore = before.activeCampaignData?.tags || []
      const tagsAfter = after.activeCampaignData?.tags || []

      if (JSON.stringify(tagsBefore) !== JSON.stringify(tagsAfter)) {
        log(`   🏷️  Tags:`)
        log(`      ANTES: [${tagsBefore.join(', ')}]`)
        log(`      DEPOIS: [${tagsAfter.join(', ')}]`)
      } else {
        log(`   🏷️  Tags: (sem alterações)`)
      }

      // Engagement
      const engBefore = before.engagement
      const engAfter = after.engagement

      if (JSON.stringify(engBefore) !== JSON.stringify(engAfter)) {
        log(`   📊 Engagement:`)
        log(`      ANTES:`, engBefore)
        log(`      DEPOIS:`, engAfter)
      }

      // Reengagement
      const reengBefore = before.reengagement
      const reengAfter = after.reengagement

      if (JSON.stringify(reengBefore) !== JSON.stringify(reengAfter)) {
        log(`   🔄 Reengagement:`)
        log(`      ANTES:`, reengBefore)
        log(`      DEPOIS:`, reengAfter)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

    const duration = Math.round((Date.now() - startTime) / 1000)

    log('\n═'.repeat(70))
    log('✅ TESTE COMPLETO!')
    log('═'.repeat(70))
    log('')
    log(`⏱️  Duração: ${duration}s`)
    log(`📧 User: ${TEST_EMAIL}`)
    log(`📦 UserProducts processados: ${userProducts.length}`)
    log(`🏷️  Orquestrações executadas: ${orchestrationResults.length}`)
    log('')
    log(`📝 Log completo salvo em:`)
    log(`   ${LOG_FILE}`)
    log('')

  } catch (error: any) {
    log('\n❌ ERRO NO TESTE:')
    log(error.message)
    log('\nStack trace:')
    log(error.stack)
  } finally {
    await mongoose.disconnect()
    log('\n👋 Desconectado da BD')
  }
}

main()