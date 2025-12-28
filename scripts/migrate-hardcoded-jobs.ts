// ════════════════════════════════════════════════════════════
// 📁 scripts/migrate-last-2-jobs.ts
// Script: Criar os 2 últimos jobs que faltam
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// 2 JOBS QUE FALTAM (VALORES CORRIGIDOS)
// ═══════════════════════════════════════════════════════════

const JOBS = [
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
      retryDelayMinutes: 5,  // ✅ CORRIGIDO: 3 → 5
      exponentialBackoff: false
    }
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
      retryDelayMinutes: 5,  // ✅ CORRIGIDO: 1 → 5
      exponentialBackoff: false
    }
  }
]

// ═══════════════════════════════════════════════════════════
// FUNÇÕES
// ═══════════════════════════════════════════════════════════

async function createJob(jobData: any) {
  try {
    const response = await axios.post(
      `${API_URL}/api/cron/jobs`,
      { ...jobData, createdBy: '000000000000000000000001' },
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
  console.log('🔧 CRIAR 2 JOBS QUE FALTAM')
  console.log('═'.repeat(70))
  console.log()
  
  // Conectividade
  console.log('🔍 Verificando API...')
  try {
    await axios.get(`${API_URL}/api/health`, { timeout: 5000 })
    console.log('✅ API acessível\n')
  } catch {
    console.log('❌ API não acessível!')
    process.exit(1)
  }
  
  // Criar jobs
  let created = 0
  let errors = 0
  
  for (const job of JOBS) {
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
  
  // Resumo
  console.log('═'.repeat(70))
  console.log('📊 RESUMO')
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
    console.log('📋 TOTAL DE JOBS CRIADOS VIA WIZARD:')
    console.log('   1. DailyPipeline (pipeline)')
    console.log('   2. EvaluateRules (desativado)')
    console.log('   3. ResetCounters')
    console.log('   4. CronExecutionCleanup')
    console.log('   5. RebuildDashboardStats')
    console.log()
    console.log('📋 PRÓXIMOS PASSOS:')
    console.log('   1. Validar frontend: http://localhost:3000/activecampaign')
    console.log('   2. Gerar relatório: npx ts-node scripts/list-all-cron-jobs.ts')
    console.log('   3. Comentar código hardcoded')
    console.log('   4. Fazer commit!')
    console.log()
  } else {
    console.log('⚠️  Alguns jobs falharam. Verifica os erros acima.')
  }
  
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('\n❌ ERRO:', error)
  process.exit(1)
})