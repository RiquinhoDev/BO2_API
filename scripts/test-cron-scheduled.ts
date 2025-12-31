// ════════════════════════════════════════════════════════════
// 🧪 TESTE COMPLETO DO CRON - DAILY PIPELINE
// Executa pipeline completo com snapshot antes/depois
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import { executeDailyPipeline } from '../src/services/syncUtilziadoresServices/dailyPipeline.service'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

const TEST_EMAILS = [
  'joaomcf37@gmail.com',
  'rui.santos@serriquinho.com'
]

console.clear()
console.log('═'.repeat(70))
console.log('🧪 TESTE COMPLETO DO CRON - DAILY PIPELINE')
console.log('═'.repeat(70))
console.log()
console.log(`📧 Emails de teste: ${TEST_EMAILS.join(', ')}`)
console.log(`⏰ Execução agendada: 12:20`)
console.log()

// ═══════════════════════════════════════════════════════════
// SNAPSHOT DO ESTADO
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
// SALVAR JSON
// ═══════════════════════════════════════════════════════════

function saveSnapshot(
  snapshotBefore: UserSnapshot[],
  snapshotAfter: UserSnapshot[],
  pipelineResult: any
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `cron-test-${timestamp}.json`
  const filepath = path.join(__dirname, '..', 'logs', filename)
  
  // Garantir que pasta logs existe
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
    
    pipeline: {
      success: pipelineResult.success,
      duration: pipelineResult.duration,
      completedAt: pipelineResult.completedAt,
      steps: pipelineResult.steps,
      summary: pipelineResult.summary,
      errors: pipelineResult.errors
    },
    
    diff: calculateDiff(snapshotBefore, snapshotAfter)
  }
  
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf-8')
  
  return filepath
}

// ═══════════════════════════════════════════════════════════
// CALCULAR DIFF
// ═══════════════════════════════════════════════════════════

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
          progress: {
            before: upBefore.progress?.percentage || 0,
            after: upAfter.progress?.percentage || 0,
            changed: (upBefore.progress?.percentage || 0) !== (upAfter.progress?.percentage || 0)
          },
          engagement: {
            daysSinceLastLogin: {
              before: upBefore.engagement?.daysSinceLastLogin,
              after: upAfter.engagement?.daysSinceLastLogin,
              changed: upBefore.engagement?.daysSinceLastLogin !== upAfter.engagement?.daysSinceLastLogin
            },
            engagementScore: {
              before: upBefore.engagement?.engagementScore,
              after: upAfter.engagement?.engagementScore,
              changed: upBefore.engagement?.engagementScore !== upAfter.engagement?.engagementScore
            }
          },
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
    console.log('📡 Conectando à BD...')
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // AGUARDAR ATÉ 12:20
    // ═══════════════════════════════════════════════════════════
    
    const targetTime = new Date()
    targetTime.setHours(12, 20, 0, 0)
    
    const now = new Date()
    
    if (now >= targetTime) {
      // Já passou das 12:20, agendar para amanhã
      targetTime.setDate(targetTime.getDate() + 1)
    }
    
    const waitTime = targetTime.getTime() - now.getTime()
    const waitMinutes = Math.floor(waitTime / (1000 * 60))
    const waitSeconds = Math.floor((waitTime % (1000 * 60)) / 1000)
    
    console.log(`⏰ Execução agendada para: ${targetTime.toLocaleString('pt-PT')}`)
    console.log(`⏳ Aguardando ${waitMinutes}min ${waitSeconds}s...`)
    console.log()
    
    await new Promise(resolve => setTimeout(resolve, waitTime))
    
    // ═══════════════════════════════════════════════════════════
    // CAPTURAR ESTADO ANTES
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📸 CAPTURANDO ESTADO ANTES')
    console.log('═'.repeat(70))
    console.log()
    
    const snapshotBefore = await captureSnapshot(TEST_EMAILS)
    
    console.log(`✅ Snapshot ANTES capturado: ${snapshotBefore.length} users`)
    snapshotBefore.forEach(s => {
      console.log(`   📧 ${s.email}:`)
      s.userProducts.forEach(up => {
        console.log(`      📦 ${up.productCode}: ${up.activeCampaignData.tags.length} tags`)
        console.log(`         Tags: ${up.activeCampaignData.tags.join(', ') || '(nenhuma)'}`)
      })
    })
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // EXECUTAR PIPELINE
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('🚀 EXECUTANDO DAILY PIPELINE')
    console.log('═'.repeat(70))
    console.log()
    
    const pipelineResult = await executeDailyPipeline()
    
    console.log()
    console.log('═'.repeat(70))
    console.log('✅ PIPELINE COMPLETO')
    console.log('═'.repeat(70))
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // CAPTURAR ESTADO DEPOIS
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📸 CAPTURANDO ESTADO DEPOIS')
    console.log('═'.repeat(70))
    console.log()
    
    const snapshotAfter = await captureSnapshot(TEST_EMAILS)
    
    console.log(`✅ Snapshot DEPOIS capturado: ${snapshotAfter.length} users`)
    snapshotAfter.forEach(s => {
      console.log(`   📧 ${s.email}:`)
      s.userProducts.forEach(up => {
        console.log(`      📦 ${up.productCode}: ${up.activeCampaignData.tags.length} tags`)
        console.log(`         Tags: ${up.activeCampaignData.tags.join(', ') || '(nenhuma)'}`)
      })
    })
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // SALVAR RESULTADOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('💾 SALVANDO RESULTADOS')
    console.log('═'.repeat(70))
    console.log()
    
    const filepath = saveSnapshot(snapshotBefore, snapshotAfter, pipelineResult)
    
    console.log(`✅ Resultados salvos em:`)
    console.log(`   ${filepath}`)
    console.log()
    
    // ═══════════════════════════════════════════════════════════
    // RESUMO
    // ═══════════════════════════════════════════════════════════
    
    console.log('═'.repeat(70))
    console.log('📊 RESUMO DO TESTE')
    console.log('═'.repeat(70))
    console.log()
    
    console.log(`⏱️  Duração total: ${pipelineResult.duration}s`)
    console.log(`✅ Sucesso: ${pipelineResult.success ? 'SIM' : 'NÃO'}`)
    console.log()
    
    console.log(`📊 Pipeline Summary:`)
    console.log(`   Users processados: ${pipelineResult.summary.totalUsers}`)
    console.log(`   UserProducts: ${pipelineResult.summary.totalUserProducts}`)
    console.log(`   Engagement atualizado: ${pipelineResult.summary.engagementUpdated}`)
    console.log(`   Tags aplicadas: ${pipelineResult.summary.tagsApplied}`)
    console.log()
    
    if (pipelineResult.errors.length > 0) {
      console.log(`❌ Erros: ${pipelineResult.errors.length}`)
      pipelineResult.errors.forEach((err: string) => {
        console.log(`   - ${err}`)
      })
      console.log()
    }
    
    console.log('═'.repeat(70))
    console.log('🎉 TESTE COMPLETO!')
    console.log('═'.repeat(70))
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log()
    console.log('👋 Desconectado')
  }
}

main()