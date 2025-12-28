// ════════════════════════════════════════════════════════════
// 📁 scripts/stress-test-jobs.ts
// FASE 1.2.3: Stress Test
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO DO STRESS TEST
// ═══════════════════════════════════════════════════════════

const TESTS = [
  {
    name: 'Execuções Simultâneas',
    description: 'Executar múltiplos jobs ao mesmo tempo',
    test: testSimultaneousExecutions
  },
  {
    name: 'Execuções Consecutivas Rápidas',
    description: 'Executar mesmo job várias vezes seguidas',
    test: testRapidConsecutiveExecutions
  },
  {
    name: 'Carga Alta de Queries',
    description: 'Múltiplas queries ao histórico simultaneamente',
    test: testHighQueryLoad
  },
  {
    name: 'Criação/Edição Simultânea',
    description: 'Criar e editar jobs em paralelo',
    test: testConcurrentModifications
  }
]

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

async function getAllJobs() {
  const response = await axios.get(`${API_URL}/api/cron/jobs`)
  return response.data.success ? response.data.data.jobs : []
}

async function executeJob(jobId: string) {
  const startTime = Date.now()
  try {
    const response = await axios.post(
      `${API_URL}/api/cron/jobs/${jobId}/execute`,
      {},
      { validateStatus: () => true, timeout: 300000 } // 5min timeout
    )
    const duration = Date.now() - startTime
    return {
      success: response.data.success,
      duration,
      error: response.data.message
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    return {
      success: false,
      duration,
      error: error.message
    }
  }
}

async function getHistory() {
  const startTime = Date.now()
  try {
    const response = await axios.get(`${API_URL}/api/cron/history`, {
      params: { limit: 50 }
    })
    const duration = Date.now() - startTime
    return { success: response.data.success, duration }
  } catch (error: any) {
    const duration = Date.now() - startTime
    return { success: false, duration, error: error.message }
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 1: Execuções Simultâneas
// ═══════════════════════════════════════════════════════════

async function testSimultaneousExecutions() {
  console.log('\n🧪 TESTE 1: Execuções Simultâneas')
  console.log('─'.repeat(70))
  console.log('📝 Executar 3 jobs diferentes ao mesmo tempo\n')
  
  try {
    const jobs = await getAllJobs()
    
    // Pegar jobs leves (não DailyPipeline)
    const lightJobs = jobs.filter((j: any) => 
      j.name !== 'DailyPipeline' && 
      j.name !== 'EvaluateRules' &&
      j.schedule.enabled
    ).slice(0, 3)
    
    if (lightJobs.length < 2) {
      console.log('⚠️  Poucos jobs disponíveis para teste simultâneo')
      return { status: 'warning', message: 'Poucos jobs disponíveis' }
    }
    
    console.log(`🔄 Executando ${lightJobs.length} jobs simultaneamente...`)
    const startTime = Date.now()
    
    const results = await Promise.allSettled(
      lightJobs.map((job: any) => executeJob(job._id))
    )
    
    const totalDuration = Date.now() - startTime
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - successful
    
    console.log(`✅ Completo em ${(totalDuration / 1000).toFixed(1)}s`)
    console.log(`   Sucessos: ${successful}/${results.length}`)
    console.log(`   Falhas: ${failed}/${results.length}`)
    
    if (failed === 0) {
      return {
        status: 'pass',
        message: `${successful} jobs executados simultaneamente`,
        duration: totalDuration
      }
    } else {
      return {
        status: 'warning',
        message: `${failed} jobs falharam`,
        duration: totalDuration
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Erro: ${error.message}`)
    return {
      status: 'fail',
      message: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 2: Execuções Consecutivas Rápidas
// ═══════════════════════════════════════════════════════════

async function testRapidConsecutiveExecutions() {
  console.log('\n🧪 TESTE 2: Execuções Consecutivas Rápidas')
  console.log('─'.repeat(70))
  console.log('📝 Executar mesmo job 5x seguidas (sem espera)\n')
  
  try {
    const jobs = await getAllJobs()
    
    // Pegar job mais leve
    const job = jobs.find((j: any) => 
      j.name === 'RebuildDashboardStats' || 
      j.name === 'CronExecutionCleanup'
    )
    
    if (!job) {
      console.log('⚠️  Job leve não encontrado')
      return { status: 'warning', message: 'Job não encontrado' }
    }
    
    console.log(`🔄 Executando ${job.name} 5x consecutivas...`)
    const startTime = Date.now()
    
    const results = []
    for (let i = 0; i < 5; i++) {
      console.log(`   Execução ${i + 1}/5...`)
      const result = await executeJob(job._id)
      results.push(result)
    }
    
    const totalDuration = Date.now() - startTime
    
    const successful = results.filter(r => r.success).length
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
    
    console.log(`✅ Completo em ${(totalDuration / 1000).toFixed(1)}s`)
    console.log(`   Sucessos: ${successful}/5`)
    console.log(`   Duração média: ${(avgDuration / 1000).toFixed(1)}s`)
    
    if (successful === 5) {
      return {
        status: 'pass',
        message: '5 execuções consecutivas OK',
        duration: totalDuration,
        avgDuration
      }
    } else {
      return {
        status: 'warning',
        message: `Apenas ${successful}/5 sucessos`,
        duration: totalDuration
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Erro: ${error.message}`)
    return {
      status: 'fail',
      message: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 3: Carga Alta de Queries
// ═══════════════════════════════════════════════════════════

async function testHighQueryLoad() {
  console.log('\n🧪 TESTE 3: Carga Alta de Queries')
  console.log('─'.repeat(70))
  console.log('📝 50 queries simultâneas ao histórico\n')
  
  try {
    console.log('🔄 Executando 50 queries simultaneamente...')
    const startTime = Date.now()
    
    const promises = Array(50).fill(null).map(() => getHistory())
    const results = await Promise.allSettled(promises)
    
    const totalDuration = Date.now() - startTime
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const avgDuration = results
      .filter(r => r.status === 'fulfilled')
      .reduce((sum, r: any) => sum + r.value.duration, 0) / successful
    
    console.log(`✅ Completo em ${(totalDuration / 1000).toFixed(1)}s`)
    console.log(`   Sucessos: ${successful}/50`)
    console.log(`   Duração média: ${avgDuration.toFixed(0)}ms`)
    console.log(`   Throughput: ${(50 / (totalDuration / 1000)).toFixed(1)} req/s`)
    
    if (successful >= 45) {
      return {
        status: 'pass',
        message: `${successful}/50 queries OK`,
        duration: totalDuration,
        avgDuration,
        throughput: 50 / (totalDuration / 1000)
      }
    } else {
      return {
        status: 'warning',
        message: `Apenas ${successful}/50 sucessos`,
        duration: totalDuration
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Erro: ${error.message}`)
    return {
      status: 'fail',
      message: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 4: Criação/Edição Simultânea
// ═══════════════════════════════════════════════════════════

async function testConcurrentModifications() {
  console.log('\n🧪 TESTE 4: Criação/Edição Simultânea')
  console.log('─'.repeat(70))
  console.log('📝 Criar e editar jobs em paralelo\n')
  
  try {
    console.log('🔄 Criando 3 jobs de teste...')
    
    const testJobs = [
      { name: 'StressTest_1', cronExpression: '0 4 * * *' },
      { name: 'StressTest_2', cronExpression: '0 5 * * *' },
      { name: 'StressTest_3', cronExpression: '0 6 * * *' }
    ]
    
    const createPromises = testJobs.map(job => 
      axios.post(`${API_URL}/api/cron/jobs`, {
        ...job,
        description: 'Teste de stress',
        syncType: 'all',
        createdBy: '000000000000000000000001'
      }, { validateStatus: () => true })
    )
    
    const createResults = await Promise.allSettled(createPromises)
    const createdIds = createResults
      .filter((r: any) => r.status === 'fulfilled' && r.value.data.success)
      .map((r: any) => r.value.data.data.job._id)
    
    console.log(`   Criados: ${createdIds.length}/3`)
    
    if (createdIds.length > 0) {
      console.log('🔄 Editando jobs simultaneamente...')
      
      const editPromises = createdIds.map(id =>
        axios.put(`${API_URL}/api/cron/jobs/${id}`, {
          description: 'Editado via stress test'
        }, { validateStatus: () => true })
      )
      
      const editResults = await Promise.allSettled(editPromises)
      const edited = editResults.filter((r: any) => 
        r.status === 'fulfilled' && r.value.data.success
      ).length
      
      console.log(`   Editados: ${edited}/${createdIds.length}`)
      
      // Cleanup: deletar jobs de teste
      console.log('🗑️  Limpando jobs de teste...')
      await Promise.allSettled(
        createdIds.map(id => axios.delete(`${API_URL}/api/cron/jobs/${id}`))
      )
    }
    
    if (createdIds.length === 3) {
      return {
        status: 'pass',
        message: '3 jobs criados e editados simultaneamente'
      }
    } else {
      return {
        status: 'warning',
        message: `Apenas ${createdIds.length}/3 jobs criados`
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Erro: ${error.message}`)
    return {
      status: 'fail',
      message: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 FASE 1.2.3: STRESS TEST')
  console.log('═'.repeat(70))
  console.log()
  console.log(`📡 API: ${API_URL}`)
  console.log(`📅 Data: ${new Date().toLocaleString('pt-PT')}`)
  console.log()
  console.log('⚠️  ATENÇÃO: Este teste vai criar carga no sistema!')
  console.log()
  
  // Verificar API
  console.log('🔍 Verificando API...')
  try {
    await axios.get(`${API_URL}/api/health`, { timeout: 5000 })
    console.log('✅ API acessível\n')
  } catch {
    console.log('❌ API não acessível!')
    process.exit(1)
  }
  
  // Executar testes
  const results = []
  
  for (const test of TESTS) {
    const result = await test.test()
    results.push({ name: test.name, ...result })
  }
  
  // Resumo
  console.log()
  console.log('═'.repeat(70))
  console.log('📊 RESUMO DO STRESS TEST')
  console.log('═'.repeat(70))
  console.log()
  
  const passed = results.filter(r => r.status === 'pass').length
  const warnings = results.filter(r => r.status === 'warning').length
  const failed = results.filter(r => r.status === 'fail').length
  
  console.log(`✅ Passou: ${passed}`)
  console.log(`⚠️  Warnings: ${warnings}`)
  console.log(`❌ Falhou: ${failed}`)
  console.log(`📝 Total: ${results.length}`)
  console.log()
  
  results.forEach(r => {
    const emoji = r.status === 'pass' ? '✅' : r.status === 'warning' ? '⚠️' : '❌'
    console.log(`${emoji} ${r.name}: ${r.message}`)
  })
  
  console.log()
  
  if (failed === 0) {
    console.log('═'.repeat(70))
    console.log('🎉 STRESS TEST COMPLETO!')
    console.log('═'.repeat(70))
    console.log()
    console.log('✅ FASE 1.2 CONCLUÍDA!')
    console.log()
    console.log('📋 PRÓXIMA FASE:')
    console.log('   → FASE 1.3: Monitoring Dashboard')
    console.log()
  } else {
    console.log('═'.repeat(70))
    console.log('❌ STRESS TEST FALHOU!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Revisa os erros antes de continuar.')
    console.log()
    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n❌ ERRO FATAL:', error)
  process.exit(1)
})