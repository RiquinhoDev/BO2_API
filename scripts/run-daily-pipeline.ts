// ════════════════════════════════════════════════════════════════════════════
// 🚀 RUN DAILY PIPELINE - Executar pipeline completo manualmente
// ════════════════════════════════════════════════════════════════════════════
//
// Este script executa o pipeline diário completo:
// 1. Sync Hotmart → Colhe dados OGI
// 2. Sync CursEduca → Colhe dados CLAREZA
// 3. Recalc Engagement → Processa metrics com dados frescos
// 4. Tag Rules → Aplica tags com dados completos
//
// ════════════════════════════════════════════════════════════════════════════

import 'dotenv/config'
import mongoose from 'mongoose'
import { runDailyPipeline } from '../src/jobs/dailyPipeline.job'

async function main() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('🚀 EXECUTANDO PIPELINE DIÁRIO COMPLETO')
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`📅 Iniciado: ${new Date().toLocaleString('pt-PT')}`)
  console.log('════════════════════════════════════════════════════════════════\n')

  try {
    // Conectar à BD
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ Conectado à BD\n')

    // Executar pipeline
    const result = await runDailyPipeline()

    console.log('\n════════════════════════════════════════════════════════════════')
    console.log('📊 RESULTADO FINAL')
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`Status: ${result.success ? '✅ SUCESSO' : '❌ FALHOU'}`)
    console.log(`Duração: ${result.duration}s (${Math.floor(result.duration / 60)}min ${result.duration % 60}s)`)
    console.log('\n📋 Steps:')
    console.log(`   1. Sync Hotmart: ${result.steps.syncHotmart.success ? '✅' : '❌'} (${result.steps.syncHotmart.duration}s)`)
    console.log(`   2. Sync CursEduca: ${result.steps.syncCursEduca.success ? '✅' : '❌'} (${result.steps.syncCursEduca.duration}s)`)
    console.log(`   3. Recalc Engagement: ${result.steps.recalcEngagement.success ? '✅' : '❌'} (${result.steps.recalcEngagement.duration}s)`)
    console.log(`   4. Evaluate Tag Rules: ${result.steps.evaluateTagRules.success ? '✅' : '❌'} (${result.steps.evaluateTagRules.duration}s)`)

    console.log('\n📊 Sumário:')
    console.log(`   Total Users: ${result.summary.totalUsers}`)
    console.log(`   Total UserProducts: ${result.summary.totalUserProducts}`)
    console.log(`   Engagement Updated: ${result.summary.engagementUpdated}`)
    console.log(`   Tags Applied: ${result.summary.tagsApplied}`)

    if (result.errors.length > 0) {
      console.log('\n⚠️  Erros:')
      result.errors.forEach((err: string, i: number) => {
        console.log(`   ${i + 1}. ${err}`)
      })
    }

    console.log('════════════════════════════════════════════════════════════════\n')

    process.exit(result.success ? 0 : 1)

  } catch (error: any) {
    console.error('\n❌ Erro fatal:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Conexão BD fechada\n')
  }
}

main()
