// ════════════════════════════════════════════════════════════
// 📁 scripts/fix-duplicate-jobs.ts
// Script: Deletar jobs duplicados e criar os corretos
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// JOBS A CRIAR
// ═══════════════════════════════════════════════════════════

const JOBS_TO_CREATE = [
  {
    name: 'EvaluateRules',
    description: '⚠️ DUPLICA DailyPipeline STEP 4! Avaliar regras de engagement. Criar DESATIVADO.',
    syncType: 'all',
    cronExpression: '0 2 * * *',
    timezone: 'Europe/Lisbon',
    syncConfig: {
      fullSync: false,
      includeProgress: false,
      includeTags: true,
      batchSize: 500
    },
    tagRuleOptions: {
      enabled: true,
      executeAllRules: true,
      runInParallel: false,
      stopOnError: false
    },
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: true,
      recipients: ['admin@osriquinhos.com']
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelayMinutes: 5,
      exponentialBackoff: false
    },
    createdBy: '000000000000000000000001'
  },
  
  {
    name: 'RebuildDashboardStats',
    description: 'Rebuild de estatísticas do dashboard. Executa a cada 5 minutos.',
    syncType: 'all',
    cronExpression: '*/5 * * * *',
    timezone: 'Europe/Lisbon',
    syncConfig: {
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 100
    },
    notifications: {
      enabled: false,
      emailOnSuccess: false,
      emailOnFailure: false,
      recipients: []
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelayMinutes: 5,
      exponentialBackoff: false
    },
    createdBy: '000000000000000000000001'
  }
]

// ═══════════════════════════════════════════════════════════
// FUNÇÕES
// ═══════════════════════════════════════════════════════════

async function getAllJobs() {
  try {
    const response = await axios.get(`${API_URL}/api/cron/jobs`)
    return response.data.success ? response.data.data.jobs : []
  } catch {
    return []
  }
}

async function deleteJob(jobId: string) {
  try {
    const response = await axios.delete(`${API_URL}/api/cron/jobs/${jobId}`)
    return response.data.success
  } catch {
    return false
  }
}

async function createJob(jobData: any) {
  try {
    const response = await axios.post(
      `${API_URL}/api/cron/jobs`,
      jobData,
      { validateStatus: () => true }
    )
    
    if (response.data.success) {
      return { success: true, data: response.data.data }
    } else {
      return { success: false, error: response.data.message }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function disableJob(jobId: string) {
  try {
    await axios.post(`${API_URL}/api/cron/jobs/${jobId}/toggle`, { enabled: false })
    return true
  } catch {
    return false
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🔧 CORRIGIR JOBS DUPLICADOS')
  console.log('═'.repeat(70))
  console.log()
  
  // 1. Buscar todos os jobs
  console.log('🔍 Buscando jobs existentes...')
  const allJobs = await getAllJobs()
  console.log(`✅ ${allJobs.length} jobs encontrados\n`)
  
  // 2. Verificar se existem os jobs problemáticos
  const jobsToDelete = []
  
  for (const jobName of ['EvaluateRules', 'RebuildDashboardStats']) {
    const existingJob = allJobs.find((j: any) => j.name === jobName)
    if (existingJob) {
      jobsToDelete.push(existingJob)
      console.log(`⚠️  Encontrado: ${jobName} (ID: ${existingJob._id})`)
    }
  }
  
  console.log()
  
  // 3. Deletar jobs antigos se existirem
  if (jobsToDelete.length > 0) {
    console.log('🗑️  Deletando jobs antigos...')
    
    for (const job of jobsToDelete) {
      console.log(`   🔄 Deletando ${job.name}...`)
      const deleted = await deleteJob(job._id)
      
      if (deleted) {
        console.log(`   ✅ ${job.name} deletado!`)
      } else {
        console.log(`   ❌ Erro ao deletar ${job.name}`)
      }
    }
    
    console.log()
  } else {
    console.log('✅ Nenhum job duplicado encontrado\n')
  }
  
  // 4. Criar jobs novos
  console.log('═'.repeat(70))
  console.log('📝 CRIANDO JOBS...')
  console.log('═'.repeat(70))
  console.log()
  
  let created = 0
  let errors = 0
  
  for (const job of JOBS_TO_CREATE) {
    console.log(`🔄 Criando ${job.name}...`)
    
    const result = await createJob(job)
    
    if (result.success) {
      console.log(`✅ ${job.name} - CRIADO!`)
      console.log(`   ID: ${result.data.job._id}`)
      
      // Desativar EvaluateRules
      if (job.name === 'EvaluateRules') {
        console.log(`⚠️  Desativando (duplica DailyPipeline)...`)
        const disabled = await disableJob(result.data.job._id)
        if (disabled) {
          console.log(`✅ Desativado com sucesso!`)
        }
      }
      
      created++
    } else {
      console.log(`❌ ${job.name} - ERRO: ${result.error}`)
      errors++
    }
    
    console.log()
  }
  
  // 5. Resumo final
  console.log('═'.repeat(70))
  console.log('📊 RESUMO FINAL')
  console.log('═'.repeat(70))
  console.log()
  console.log(`✅ Criados: ${created}`)
  console.log(`❌ Erros: ${errors}`)
  console.log()
  
  if (created === 2) {
    console.log('═'.repeat(70))
    console.log('🎉 MIGRAÇÃO 100% COMPLETA!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 TOTAL DE 5 JOBS CRIADOS VIA WIZARD:')
    console.log('   1. ✅ DailyPipeline (pipeline)')
    console.log('   2. ⏸️  EvaluateRules (desativado)')
    console.log('   3. ✅ ResetCounters')
    console.log('   4. ✅ CronExecutionCleanup')
    console.log('   5. ✅ RebuildDashboardStats')
    console.log()
    console.log('📋 PRÓXIMOS PASSOS:')
    console.log('   1. Validar: http://localhost:3000/activecampaign')
    console.log('   2. Gerar relatório: npx ts-node scripts/list-all-cron-jobs.ts')
    console.log('   3. Comentar código hardcoded')
    console.log('   4. Fazer commit!')
    console.log()
  }
  
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('❌ ERRO:', error)
  process.exit(1)
})