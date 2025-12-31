// ════════════════════════════════════════════════════════════
// 🔍 VERIFICAR JOBS CRON ATIVOS
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import '../src/models'
import CronJobConfig from '../src/models/SyncModels/CronJobConfig'

const MONGO_URL = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
const DB_NAME = process.env.DB_NAME!

console.clear()
console.log('═'.repeat(70))
console.log('🔍 VERIFICAR JOBS CRON ATIVOS')
console.log('═'.repeat(70))
console.log()

async function main() {
  try {
    await mongoose.connect(MONGO_URL)
    console.log('✅ Conectado ao MongoDB')
    console.log()

    // ═══════════════════════════════════════════════════════════
    // BUSCAR TODOS OS JOBS
    // ═══════════════════════════════════════════════════════════

    const jobs = await CronJobConfig.find().sort({ createdAt: -1 })

    console.log(`📋 Total de jobs: ${jobs.length}`)
    console.log()

    if (jobs.length === 0) {
      console.log('❌ Nenhum job encontrado na BD!')
      console.log()
      console.log('💡 Precisas criar jobs via:')
      console.log('   1. Front-end wizard (http://localhost:3000/activecampaign)')
      console.log('   2. Script de seed')
      console.log('   3. API POST /api/cron/jobs')
      console.log()
      return
    }

    // ═══════════════════════════════════════════════════════════
    // MOSTRAR JOBS
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('📋 JOBS ENCONTRADOS:')
    console.log('═'.repeat(70))
    console.log()

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      const isEnabled = job.schedule?.enabled ?? false
      const isActive = job.isActive ?? false

      const status = isEnabled && isActive ? '🟢 ATIVO' : 
                     isActive ? '🟡 CRIADO (disabled)' : 
                     '🔴 INATIVO'

      console.log(`${i + 1}. ${job.name}`)
      console.log(`   Status: ${status}`)
      console.log(`   Tipo: ${job.syncType}`)
      console.log(`   Cron: ${job.schedule?.cronExpression || 'N/A'}`)
      console.log(`   Próxima execução: ${job.nextRun ? job.nextRun.toISOString() : 'N/A'}`)
      console.log(`   Total execuções: ${job.totalRuns || 0}`)
      console.log()
    }

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR SE EXISTE DAILY PIPELINE
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('🔍 PROCURANDO DAILY PIPELINE:')
    console.log('═'.repeat(70))
    console.log()

    const pipelineJobs = jobs.filter(j => 
      j.syncType === 'pipeline' || 
      j.name.toLowerCase().includes('pipeline') ||
      j.name.toLowerCase().includes('daily')
    )

    if (pipelineJobs.length === 0) {
      console.log('❌ DAILY PIPELINE NÃO ENCONTRADO!')
      console.log()
      console.log('💡 SOLUÇÃO:')
      console.log('   Criar job "Daily Pipeline" com:')
      console.log('   - syncType: "pipeline"')
      console.log('   - cronExpression: "0 2 * * *"')
      console.log('   - enabled: true')
      console.log()
    } else {
      console.log(`✅ ${pipelineJobs.length} Daily Pipeline(s) encontrado(s):`)
      console.log()

      for (const job of pipelineJobs) {
        const isEnabled = job.schedule?.enabled ?? false
        const isActive = job.isActive ?? false

        console.log(`   📦 ${job.name}`)
        console.log(`      ID: ${job._id}`)
        console.log(`      Enabled: ${isEnabled ? '✅ SIM' : '❌ NÃO'}`)
        console.log(`      Active: ${isActive ? '✅ SIM' : '❌ NÃO'}`)
        console.log(`      Cron: ${job.schedule?.cronExpression}`)
        console.log(`      Próxima execução: ${job.nextRun?.toISOString()}`)
        console.log()

        if (!isEnabled || !isActive) {
          console.log('   ⚠️  ATENÇÃO: Job não está ativo!')
          console.log(`      Para ativar: PUT /api/cron/jobs/${job._id}/toggle`)
          console.log()
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESUMO
    // ═══════════════════════════════════════════════════════════

    console.log('═'.repeat(70))
    console.log('📊 RESUMO:')
    console.log('═'.repeat(70))
    console.log()

    const activeJobs = jobs.filter(j => j.schedule?.enabled && j.isActive)
    const inactiveJobs = jobs.filter(j => !j.schedule?.enabled || !j.isActive)

    console.log(`🟢 Jobs ativos: ${activeJobs.length}`)
    console.log(`🔴 Jobs inativos: ${inactiveJobs.length}`)
    console.log()

    if (activeJobs.length > 0) {
      console.log('🟢 Jobs que vão executar:')
      for (const job of activeJobs) {
        console.log(`   - ${job.name} (${job.schedule.cronExpression})`)
      }
      console.log()
    }

    if (inactiveJobs.length > 0) {
      console.log('🔴 Jobs desativados:')
      for (const job of inactiveJobs) {
        console.log(`   - ${job.name}`)
      }
      console.log()
    }

  } catch (error: any) {
    console.error('❌ Erro:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado')
  }
}

main()