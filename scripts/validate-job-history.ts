// ════════════════════════════════════════════════════════════
// 📁 scripts/validate-job-history.ts
// FASE 1.2.2: Validar Histórico Completo
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// TESTES DE VALIDAÇÃO
// ═══════════════════════════════════════════════════════════

interface TestResult {
  test: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: any
}

const results: TestResult[] = []

function addResult(test: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any) {
  results.push({ test, status, message, details })
  
  const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️'
  console.log(`${emoji} ${test}: ${message}`)
  
  if (details) {
    console.log(`   Detalhes:`, details)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 1: Verificar CronExecution existe e tem dados
// ═══════════════════════════════════════════════════════════

async function testCronExecutionExists() {
  console.log('\n🔍 TESTE 1: Verificar CronExecution collection...')
  
  try {
    // Buscar histórico de execuções
    const response = await axios.get(`${API_URL}/api/cron/history`)
    
    if (!response.data.success) {
      addResult(
        'CronExecution Collection',
        'fail',
        'Endpoint /api/cron/history falhou'
      )
      return
    }
    
    const executions = response.data.data?.executions || []
    
    if (executions.length === 0) {
      addResult(
        'CronExecution Collection',
        'warning',
        'Collection existe mas sem dados (ainda)'
      )
      return
    }
    
    addResult(
      'CronExecution Collection',
      'pass',
      `${executions.length} execuções registadas`,
      { count: executions.length }
    )
    
    // Verificar estrutura dos dados
    const latestExec = executions[0]
    const hasRequiredFields = 
      latestExec.cronName &&
      latestExec.status &&
      latestExec.startTime &&
      latestExec.duration !== undefined
    
    if (!hasRequiredFields) {
      addResult(
        'CronExecution Schema',
        'fail',
        'Campos obrigatórios em falta'
      )
      return
    }
    
    addResult(
      'CronExecution Schema',
      'pass',
      'Todos os campos obrigatórios presentes'
    )
    
  } catch (error: any) {
    addResult(
      'CronExecution Collection',
      'fail',
      error.message
    )
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 2: Validar estatísticas dos jobs
// ═══════════════════════════════════════════════════════════

async function testJobStatistics() {
  console.log('\n🔍 TESTE 2: Validar estatísticas dos jobs...')
  
  try {
    const response = await axios.get(`${API_URL}/api/cron/jobs`)
    
    if (!response.data.success) {
      addResult('Job Statistics', 'fail', 'Erro ao buscar jobs')
      return
    }
    
    const jobs = response.data.data?.jobs || []
    
    // Verificar se cada job tem estatísticas
    for (const job of jobs) {
      const hasStats = 
        job.totalRuns !== undefined &&
        job.successfulRuns !== undefined &&
        job.failedRuns !== undefined
      
      if (!hasStats) {
        addResult(
          `Stats - ${job.name}`,
          'fail',
          'Estatísticas em falta'
        )
        continue
      }
      
      // Verificar lastRun se job já executou
      if (job.totalRuns > 0) {
        if (!job.lastRun) {
          addResult(
            `LastRun - ${job.name}`,
            'warning',
            'Job executou mas lastRun vazio'
          )
          continue
        }
        
        const successRate = job.getSuccessRate ? job.getSuccessRate() : 
                           (job.successfulRuns / job.totalRuns) * 100
        
        addResult(
          `Stats - ${job.name}`,
          'pass',
          `${job.totalRuns} runs, ${successRate.toFixed(0)}% sucesso`,
          {
            total: job.totalRuns,
            success: job.successfulRuns,
            failed: job.failedRuns,
            successRate: `${successRate.toFixed(1)}%`
          }
        )
      } else {
        addResult(
          `Stats - ${job.name}`,
          'pass',
          'Ainda não executado (normal)',
          { totalRuns: 0 }
        )
      }
    }
    
  } catch (error: any) {
    addResult('Job Statistics', 'fail', error.message)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 3: Queries de dashboard funcionam
// ═══════════════════════════════════════════════════════════

async function testDashboardQueries() {
  console.log('\n🔍 TESTE 3: Testar queries de dashboard...')
  
  try {
    // Query 1: Histórico recente (últimas 24h)
    const response1 = await axios.get(`${API_URL}/api/cron/history`, {
      params: { limit: 20 }
    })
    
    if (response1.data.success) {
      addResult(
        'Query - Histórico Recente',
        'pass',
        `${response1.data.data?.executions?.length || 0} registos retornados`
      )
    } else {
      addResult('Query - Histórico Recente', 'fail', 'Query falhou')
    }
    
    // Query 2: Filtrar por job específico
    const response2 = await axios.get(`${API_URL}/api/cron/history`, {
      params: { cronName: 'DailyPipeline' }
    })
    
    if (response2.data.success) {
      const count = response2.data.data?.executions?.length || 0
      addResult(
        'Query - Filtro por Job',
        'pass',
        `${count} execuções do DailyPipeline`
      )
    } else {
      addResult('Query - Filtro por Job', 'fail', 'Query falhou')
    }
    
    // Query 3: Filtrar por status
    const response3 = await axios.get(`${API_URL}/api/cron/history`, {
      params: { status: 'success' }
    })
    
    if (response3.data.success) {
      const count = response3.data.data?.executions?.length || 0
      addResult(
        'Query - Filtro por Status',
        'pass',
        `${count} execuções com sucesso`
      )
    } else {
      addResult('Query - Filtro por Status', 'fail', 'Query falhou')
    }
    
  } catch (error: any) {
    addResult('Dashboard Queries', 'fail', error.message)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 4: Validar integridade dos dados
// ═══════════════════════════════════════════════════════════

async function testDataIntegrity() {
  console.log('\n🔍 TESTE 4: Validar integridade dos dados...')
  
  try {
    const response = await axios.get(`${API_URL}/api/cron/history`, {
      params: { limit: 100 }
    })
    
    if (!response.data.success) {
      addResult('Data Integrity', 'fail', 'Erro ao buscar histórico')
      return
    }
    
    const executions = response.data.data?.executions || []
    
    if (executions.length === 0) {
      addResult('Data Integrity', 'warning', 'Sem dados para validar')
      return
    }
    
    let issuesFound = 0
    
    for (const exec of executions) {
      // Verificar duration >= 0
      if (exec.duration < 0) {
        issuesFound++
        console.log(`   ⚠️  Duration negativo: ${exec.cronName}`)
      }
      
      // Verificar datas válidas
      const startTime = new Date(exec.startTime)
      const endTime = exec.endTime ? new Date(exec.endTime) : null
      
      if (isNaN(startTime.getTime())) {
        issuesFound++
        console.log(`   ⚠️  startTime inválido: ${exec.cronName}`)
      }
      
      if (endTime && isNaN(endTime.getTime())) {
        issuesFound++
        console.log(`   ⚠️  endTime inválido: ${exec.cronName}`)
      }
      
      // Verificar endTime > startTime
      if (endTime && endTime < startTime) {
        issuesFound++
        console.log(`   ⚠️  endTime < startTime: ${exec.cronName}`)
      }
      
      // Verificar status válido
      const validStatuses = ['success', 'error', 'running', 'pending']
      if (!validStatuses.includes(exec.status)) {
        issuesFound++
        console.log(`   ⚠️  Status inválido: ${exec.status}`)
      }
    }
    
    if (issuesFound === 0) {
      addResult(
        'Data Integrity',
        'pass',
        `${executions.length} registos validados sem problemas`
      )
    } else {
      addResult(
        'Data Integrity',
        'warning',
        `${issuesFound} problemas encontrados em ${executions.length} registos`
      )
    }
    
  } catch (error: any) {
    addResult('Data Integrity', 'fail', error.message)
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE 5: Performance das queries
// ═══════════════════════════════════════════════════════════

async function testQueryPerformance() {
  console.log('\n🔍 TESTE 5: Testar performance das queries...')
  
  try {
    const startTime = Date.now()
    
    await axios.get(`${API_URL}/api/cron/history`, {
      params: { limit: 100 }
    })
    
    const duration = Date.now() - startTime
    
    if (duration < 1000) {
      addResult(
        'Query Performance',
        'pass',
        `Query rápida: ${duration}ms`
      )
    } else if (duration < 3000) {
      addResult(
        'Query Performance',
        'warning',
        `Query lenta: ${duration}ms (esperado <1000ms)`
      )
    } else {
      addResult(
        'Query Performance',
        'fail',
        `Query muito lenta: ${duration}ms`
      )
    }
    
  } catch (error: any) {
    addResult('Query Performance', 'fail', error.message)
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 FASE 1.2.2: VALIDAR HISTÓRICO COMPLETO')
  console.log('═'.repeat(70))
  console.log()
  console.log(`📡 API: ${API_URL}`)
  console.log(`📅 Data: ${new Date().toLocaleString('pt-PT')}`)
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
  await testCronExecutionExists()
  await testJobStatistics()
  await testDashboardQueries()
  await testDataIntegrity()
  await testQueryPerformance()
  
  // Resumo
  console.log()
  console.log('═'.repeat(70))
  console.log('📊 RESUMO DA VALIDAÇÃO')
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
  
  if (failed === 0 && warnings === 0) {
    console.log('═'.repeat(70))
    console.log('🎉 HISTÓRICO VALIDADO COM SUCESSO!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 PRÓXIMO PASSO:')
    console.log('   → Executar: npx ts-node scripts/stress-test-jobs.ts')
    console.log()
  } else if (failed === 0) {
    console.log('═'.repeat(70))
    console.log('⚠️  VALIDAÇÃO COMPLETA COM WARNINGS')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Revisa os warnings antes de continuar.')
    console.log()
  } else {
    console.log('═'.repeat(70))
    console.log('❌ VALIDAÇÃO FALHOU!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Corrige os erros antes de continuar.')
    console.log()
    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n❌ ERRO FATAL:', error)
  process.exit(1)
})