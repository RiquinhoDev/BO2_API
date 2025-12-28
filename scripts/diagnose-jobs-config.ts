// ════════════════════════════════════════════════════════════
// 📁 scripts/diagnose-jobs-config.ts
// Diagnosticar configuração dos jobs
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

async function diagnoseJobs() {
  console.log('\n🔍 ════════════════════════════════════════════════════════════')
  console.log('🔍 DIAGNÓSTICO: Configuração dos Jobs')
  console.log('🔍 ════════════════════════════════════════════════════════════\n')

  try {
    // Buscar jobs
    const response = await axios.get(`${API_URL}/api/cron/jobs`)
    
    if (!response.data.success) {
      console.log('❌ Erro ao buscar jobs!')
      return
    }

    const jobs = response.data.data.jobs
    
    console.log(`📋 Total de jobs: ${jobs.length}\n`)
    
    // Analisar cada job
    for (const job of jobs) {
      console.log('═'.repeat(70))
      console.log(`📌 JOB: ${job.name}`)
      console.log('═'.repeat(70))
      
      // Informações básicas
      console.log(`📝 Descrição: ${job.description}`)
      console.log(`🎯 syncType: ${job.syncType}`)
      console.log(`⏰ Schedule: ${job.schedule.cronExpression}`)
      console.log(`✅ Ativo: ${job.schedule.enabled}`)
      
      // Stats
      console.log(`\n📊 ESTATÍSTICAS:`)
      console.log(`   Total execuções: ${job.totalRuns}`)
      console.log(`   Sucessos: ${job.successfulRuns}`)
      console.log(`   Falhas: ${job.failedRuns}`)
      
      if (job.lastRun) {
        console.log(`\n⏱️  ÚLTIMA EXECUÇÃO:`)
        console.log(`   Início: ${job.lastRun.startedAt}`)
        console.log(`   Duração: ${Math.floor(job.lastRun.duration / 60)}min ${job.lastRun.duration % 60}s`)
        console.log(`   Status: ${job.lastRun.status}`)
        console.log(`   Total processado: ${job.lastRun.stats?.total || 0}`)
      }
      
      // ═══════════════════════════════════════════════════════════
      // ANÁLISE DO PROBLEMA
      // ═══════════════════════════════════════════════════════════
      
      console.log(`\n🔍 ANÁLISE:`)
      
      // Verificar se nome sugere que NÃO devia fazer sync
      const nonSyncJobNames = [
        'EvaluateRules',
        'ResetCounters', 
        'CronExecutionCleanup',
        'RebuildDashboardStats'
      ]
      
      const isNonSyncJob = nonSyncJobNames.some(name => 
        job.name.includes(name)
      )
      
      if (isNonSyncJob && job.syncType !== 'pipeline') {
        console.log(`   ⚠️  PROBLEMA DETECTADO!`)
        console.log(`   ❌ Job "${job.name}" NÃO devia fazer sync!`)
        console.log(`   ❌ Mas tem syncType: "${job.syncType}"`)
        console.log(`   ❌ Isso faz com que execute sync completo!`)
        console.log()
        console.log(`   💡 SOLUÇÃO:`)
        console.log(`   - EvaluateRules → devia só avaliar tag rules`)
        console.log(`   - ResetCounters → devia só resetar contadores`)
        console.log(`   - CronExecutionCleanup → devia só limpar histórico`)
        console.log(`   - RebuildDashboardStats → devia só reconstruir stats`)
        console.log()
        console.log(`   ✅ ESTES JOBS DEVIAM TER LÓGICA PRÓPRIA!`)
        console.log(`   ✅ NÃO DEVIAM CHAMAR executeUniversalSync()!`)
        
      } else if (job.syncType === 'pipeline') {
        console.log(`   ✅ OK: Job de pipeline (faz sync completo)`)
        
      } else if (['hotmart', 'curseduca', 'discord'].includes(job.syncType)) {
        console.log(`   ℹ️  Job de sync de ${job.syncType}`)
        console.log(`   ℹ️  Faz sync completo dessa plataforma`)
        
      } else {
        console.log(`   ❓ syncType desconhecido: ${job.syncType}`)
      }
      
      console.log()
    }
    
    // Resumo final
    console.log('═'.repeat(70))
    console.log('📊 RESUMO DO DIAGNÓSTICO')
    console.log('═'.repeat(70))
    
    const problemJobs = jobs.filter((j: any) => {
      const nonSyncJobNames = [
        'EvaluateRules',
        'ResetCounters',
        'CronExecutionCleanup',
        'RebuildDashboardStats'
      ]
      return nonSyncJobNames.some(name => j.name.includes(name)) && 
             j.syncType !== 'pipeline'
    })
    
    if (problemJobs.length > 0) {
      console.log(`\n❌ PROBLEMAS ENCONTRADOS: ${problemJobs.length} jobs`)
      console.log()
      problemJobs.forEach((j: any) => {
        console.log(`   ❌ ${j.name} (syncType: ${j.syncType})`)
      })
      console.log()
      console.log('💡 SOLUÇÃO:')
      console.log('   Estes jobs precisam ter lógica específica!')
      console.log('   NÃO devem chamar executeUniversalSync()!')
      console.log()
      console.log('📝 AÇÕES NECESSÁRIAS:')
      console.log('   1. Criar ficheiros .job.ts específicos para cada job')
      console.log('   2. Implementar lógica específica (sem sync)')
      console.log('   3. Atualizar scheduler para chamar ficheiros corretos')
      
    } else {
      console.log('\n✅ Todos os jobs parecem estar configurados corretamente!')
    }
    
    console.log()
    
  } catch (error: any) {
    console.error('❌ Erro ao diagnosticar:', error.message)
  }
}

diagnoseJobs()