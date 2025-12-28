// ════════════════════════════════════════════════════════════
// 📁 scripts/test-e2e-all-jobs.ts
// FASE 1.2: Testes E2E - Jobs Restantes
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO DOS TESTES
// ═══════════════════════════════════════════════════════════

const JOBS_TO_TEST = [
  {
    name: 'DailyPipeline',
    description: 'Pipeline completo (4 steps)',
    expectedDuration: 60, // minutos
    shouldTest: false, // Job longo - correr à noite
    skipReason: 'Job demorado - executado via CRON'
  },
  {
    name: 'EvaluateRules',
    description: 'Avaliação de regras de tags',
    expectedDuration: 30,
    shouldTest: false, // ✅ JÁ TESTADO
    skipReason: 'Já testado e validado'
  },
  {
    name: 'ResetCounters',
    description: 'Reset de contadores semanais',
    expectedDuration: 5,
    shouldTest: true, // ✅ TESTAR
    expectedStats: { total: 100, errors: 0 }
  },
  {
    name: 'CronExecutionCleanup',
    description: 'Limpeza de histórico antigo',
    expectedDuration: 2,
    shouldTest: true, // ✅ TESTAR
    expectedStats: { total: 0, errors: 0 }
  },
  {
    name: 'RebuildDashboardStats',
    description: 'Rebuild de estatísticas',
    expectedDuration: 1,
    shouldTest: true, // ✅ TESTAR
    expectedStats: { total: 50, errors: 0 }
  }
]

// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE TESTE
// ═══════════════════════════════════════════════════════════

async function getAllJobs() {
  try {
    const response = await axios.get(`${API_URL}/api/cron/jobs`)
    return response.data.success ? response.data.data.jobs : []
  } catch (error: any) {
    throw new Error(`Erro ao buscar jobs: ${error.message}`)
  }
}

async function executeJob(jobId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/cron/jobs/${jobId}/trigger`,
      {},
      { 
        validateStatus: () => true,
        timeout: 600000  // 10 minutos timeout (suficiente para jobs rápidos)
      }
    )
    
    return {
      success: response.data.success,
      data: response.data.data,
      error: response.data.message
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

async function sleep(seconds: number) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

// ═══════════════════════════════════════════════════════════
// TESTE INDIVIDUAL
// ═══════════════════════════════════════════════════════════

async function testIndividualJob(job: any, jobConfig: any) {
  console.log('═'.repeat(70))
  console.log(`🧪 TESTANDO: ${jobConfig.name}`)
  console.log('═'.repeat(70))
  console.log(`📝 Descrição: ${jobConfig.description}`)
  console.log(`⏱️  Duração esperada: ~${jobConfig.expectedDuration} min`)
  console.log()
  
  const startTime = Date.now()
  
  // Executar job
  console.log('🔄 Executando job...')
  const result = await executeJob(job._id)
  
  const duration = Math.round((Date.now() - startTime) / 1000)
  const durationMin = Math.floor(duration / 60)
  const durationSec = duration % 60
  
  console.log()
  
  if (result.success) {
    console.log('✅ JOB EXECUTADO COM SUCESSO!')
    console.log(`⏱️  Duração: ${durationMin}min ${durationSec}s`)
    console.log()
    
    // Mostrar estatísticas (se existirem)
    if (result.data?.stats) {
      console.log('📊 ESTATÍSTICAS:')
      const stats = result.data.stats
      
      if (stats.total !== undefined) console.log(`   Total: ${stats.total}`)
      if (stats.inserted !== undefined) console.log(`   Inseridos: ${stats.inserted}`)
      if (stats.updated !== undefined) console.log(`   Atualizados: ${stats.updated}`)
      if (stats.errors !== undefined) console.log(`   Erros: ${stats.errors}`)
      if (stats.skipped !== undefined) console.log(`   Pulados: ${stats.skipped}`)
      if (stats.deleted !== undefined) console.log(`   Deletados: ${stats.deleted}`)
      console.log()
      
      // Validação simples: sem erros
      const hasErrors = stats.errors > 0
      
      if (hasErrors) {
        console.log('⚠️  WARNING: Job completou com erros!')
        return { status: 'warning', duration, stats }
      } else {
        console.log('✅ VALIDAÇÃO: OK (sem erros)')
        return { status: 'success', duration, stats }
      }
    } else {
      console.log('✅ VALIDAÇÃO: OK (job executou sem stats)')
      return { status: 'success', duration, stats: {} }
    }
    
  } else {
    console.log('❌ JOB FALHOU!')
    console.log(`   Erro: ${result.error}`)
    console.log()
    
    return { status: 'failed', duration, error: result.error }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 FASE 1.2: TESTES E2E - JOBS RESTANTES')
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
  
  // Buscar jobs
  console.log('🔍 Buscando jobs criados...')
  const allJobs = await getAllJobs()
  console.log(`✅ ${allJobs.length} jobs encontrados\n`)
  
  // Mostrar jobs que serão testados
  const toTest = JOBS_TO_TEST.filter(j => j.shouldTest)
  const toSkip = JOBS_TO_TEST.filter(j => !j.shouldTest)
  
  console.log('📋 PLANO DE TESTES:')
  console.log()
  
  if (toTest.length > 0) {
    console.log(`✅ Jobs a testar (${toTest.length}):`)
    toTest.forEach(j => console.log(`   - ${j.name}`))
    console.log()
  }
  
  if (toSkip.length > 0) {
    console.log(`⏭️  Jobs a pular (${toSkip.length}):`)
    toSkip.forEach(j => console.log(`   - ${j.name} (${j.skipReason})`))
    console.log()
  }
  
  console.log('─'.repeat(70))
  console.log()
  
  // Executar testes
  const results: any[] = []
  
  for (const jobConfig of JOBS_TO_TEST) {
    const job = allJobs.find((j: any) => j.name === jobConfig.name)
    
    if (!job) {
      console.log(`⚠️  Job ${jobConfig.name} não encontrado - SKIP\n`)
      results.push({ name: jobConfig.name, status: 'not_found' })
      continue
    }
    
    if (!jobConfig.shouldTest) {
      console.log(`⏭️  ${jobConfig.name} - ${jobConfig.skipReason} - SKIP\n`)
      results.push({ name: jobConfig.name, status: 'skipped' })
      continue
    }
    
    const result = await testIndividualJob(job, jobConfig)
    results.push({ name: jobConfig.name, ...result })
    
    console.log()
    
    // Aguardar entre testes
    const isLast = JOBS_TO_TEST.indexOf(jobConfig) === JOBS_TO_TEST.length - 1
    if (!isLast && jobConfig.shouldTest) {
      console.log('⏳ Aguardando 3 segundos antes do próximo teste...\n')
      await sleep(3)
    }
  }
  
  // Resumo final
  console.log('═'.repeat(70))
  console.log('📊 RESUMO DOS TESTES')
  console.log('═'.repeat(70))
  console.log()
  
  const tested = results.filter(r => r.status !== 'skipped' && r.status !== 'not_found')
  const success = results.filter(r => r.status === 'success').length
  const warnings = results.filter(r => r.status === 'warning').length
  const failed = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped' || r.status === 'not_found').length
  
  console.log('📈 RESULTADOS:')
  console.log(`   ✅ Sucesso: ${success}`)
  console.log(`   ⚠️  Warnings: ${warnings}`)
  console.log(`   ❌ Falhas: ${failed}`)
  console.log(`   ⏭️  Pulados: ${skipped}`)
  console.log(`   📊 Total testado: ${tested.length}/${JOBS_TO_TEST.length}`)
  console.log()
  
  // Detalhes
  console.log('📋 DETALHES POR JOB:')
  console.log()
  results.forEach(r => {
    const emoji = r.status === 'success' ? '✅' : 
                  r.status === 'warning' ? '⚠️' : 
                  r.status === 'failed' ? '❌' : 
                  r.status === 'skipped' ? '⏭️' : '❓'
    
    console.log(`${emoji} ${r.name}`)
    
    if (r.duration !== undefined) {
      const min = Math.floor(r.duration / 60)
      const sec = r.duration % 60
      console.log(`   Duração: ${min}min ${sec}s`)
    }
    
    if (r.stats && Object.keys(r.stats).length > 0) {
      const statsStr = Object.entries(r.stats)
        .filter(([key, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')
      console.log(`   Stats: ${statsStr}`)
    }
    
    if (r.error) {
      console.log(`   Erro: ${r.error}`)
    }
    
    console.log()
  })
  
  // Conclusão
  console.log('═'.repeat(70))
  
  if (failed === 0 && warnings === 0 && tested.length > 0) {
    console.log('🎉 TODOS OS TESTES PASSARAM!')
    console.log('═'.repeat(70))
    console.log()
    console.log('✅ Jobs testados estão funcionais')
    console.log('⏰ Jobs demorados serão executados via CRON à noite')
    console.log()
    console.log('📋 PRÓXIMO PASSO:')
    console.log('   → Validar histórico: npx ts-node scripts/validate-job-history.ts')
    console.log()
  } else if (failed === 0 && tested.length > 0) {
    console.log('⚠️  TESTES COMPLETOS COM WARNINGS')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Revisa os warnings acima antes de continuar.')
    console.log()
  } else if (tested.length === 0) {
    console.log('⚠️  NENHUM JOB FOI TESTADO')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Todos os jobs foram pulados. Verifica a configuração.')
    console.log()
  } else {
    console.log('❌ ALGUNS TESTES FALHARAM!')
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