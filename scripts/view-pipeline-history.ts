/**
 * 📊 VIEW PIPELINE HISTORY
 *
 * Script para consultar histórico de execuções do Daily Pipeline
 *
 * Usage:
 *   npm run pipeline:history           # Ver últimas 10 execuções
 *   LIMIT=20 npm run pipeline:history  # Ver últimas 20 execuções
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import '../src/models'
import PipelineExecution from '../src/models/cron/PipelineExecution'

async function viewPipelineHistory() {
  console.log('━'.repeat(60))
  console.log('📊 HISTÓRICO DE EXECUÇÕES DO PIPELINE')
  console.log('━'.repeat(60))
  console.log('')

  try {
    // Conectar BD
    const mongoUri = process.env.MONGO_URI || ''
    if (!mongoUri) throw new Error('MONGO_URI não configurado')

    await mongoose.connect(mongoUri)

    const limit = parseInt(process.env.LIMIT || '10')

    // Buscar histórico
    console.log(`📋 Últimas ${limit} execuções:\n`)

    const executions = await PipelineExecution.find()
      .sort({ startTime: -1 })
      .limit(limit)
      .lean()

    if (executions.length === 0) {
      console.log('   ℹ️  Nenhuma execução encontrada')
      console.log('')
      return
    }

    // Exibir cada execução
    executions.forEach((exec, index) => {
      const startTime = new Date(exec.startTime).toLocaleString('pt-PT', {
        dateStyle: 'short',
        timeStyle: 'short'
      })

      const statusIcon = exec.status === 'success' ? '✅' : exec.status === 'partial' ? '⚠️' : '❌'

      const durationMin = Math.floor(exec.duration / 60)
      const durationSec = exec.duration % 60

      console.log(`${index + 1}. ${statusIcon} ${startTime} | ${exec.status.toUpperCase()}`)
      console.log(`   Duração: ${durationMin}min ${durationSec}s`)
      console.log(`   Users: ${exec.summary?.totalUsers || 0} | UserProducts: ${exec.summary?.totalUserProducts || 0} | Tags: ${exec.summary?.tagsApplied || 0}`)

      // Steps resumo
      const steps = exec.steps
      console.log(`   Steps:`)
      console.log(`      1. Hotmart:      ${steps?.syncHotmart?.success ? '✓' : '✗'} ${steps?.syncHotmart?.duration || 0}s | ${steps?.syncHotmart?.stats?.total || 0} users`)
      console.log(`      2. CursEduca:    ${steps?.syncCursEduca?.success ? '✓' : '✗'} ${steps?.syncCursEduca?.duration || 0}s | ${steps?.syncCursEduca?.stats?.total || 0} users`)
      console.log(`      3. Pre-create:   ${steps?.preCreateTags?.success ? '✓' : '✗'} ${steps?.preCreateTags?.duration || 0}s | ${steps?.preCreateTags?.stats?.totalTags || 0} tags`)
      console.log(`      4. Engagement:   ${steps?.recalcEngagement?.success ? '✓' : '✗'} ${steps?.recalcEngagement?.duration || 0}s | ${steps?.recalcEngagement?.stats?.updated || 0} atualizados`)
      console.log(`      5. Tag Rules:    ${steps?.evaluateTagRules?.success ? '✓' : '✗'} ${steps?.evaluateTagRules?.duration || 0}s | +${steps?.evaluateTagRules?.stats?.tagsApplied || 0}/-${steps?.evaluateTagRules?.stats?.tagsRemoved || 0}`)

      // Erros
      if (exec.errorMessages && exec.errorMessages.length > 0) {
        console.log(`   ❌ Erros (${exec.errorMessages.length}):`)
        exec.errorMessages.forEach((err: string) => console.log(`      - ${err}`))
      }

      console.log('')
    })

    // Estatísticas gerais (últimos 7 dias)
    console.log('━'.repeat(60))
    console.log('📈 ESTATÍSTICAS (ÚLTIMOS 7 DIAS)')
    console.log('━'.repeat(60))
    console.log('')

    const stats = await (PipelineExecution as any).getExecutionStats(7)

    if (stats.length > 0) {
      const s = stats[0]
      console.log(`Total execuções:     ${s.totalExecutions}`)
      console.log(`Sucessos:            ${s.successCount} (${((s.successCount / s.totalExecutions) * 100).toFixed(1)}%)`)
      console.log(`Parciais:            ${s.partialCount}`)
      console.log(`Falhas:              ${s.failedCount}`)
      console.log(`Duração média:       ${Math.floor(s.avgDuration / 60)}min ${Math.floor(s.avgDuration % 60)}s`)
      console.log(`Total users:         ${s.totalUsersProcessed}`)
      console.log(`Total tags:          ${s.totalTagsApplied}`)
    } else {
      console.log('   ℹ️  Nenhuma execução nos últimos 7 dias')
    }

    console.log('')
    console.log('━'.repeat(60))

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', JSON.stringify(error.response.data, null, 2))
    }
    process.exit(1)
  } finally {
    await mongoose.connection.close()
  }
}

// Executar
viewPipelineHistory()
  .then(() => {
    console.log('✅ Consulta finalizada')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error.message)
    process.exit(1)
  })
