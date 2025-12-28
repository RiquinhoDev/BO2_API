// ════════════════════════════════════════════════════════════
// 📁 scripts/validate-no-hardcoded.ts
// Validar que ZERO jobs hardcoded estão ativos
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const JOBS_DIR = path.join(process.cwd(), 'src', 'jobs')

const FILES_TO_CHECK = [
  'dailyPipeline.job.ts',
  'evaluateRules.job.ts',
  'resetCounters.job.ts',
  'cronExecutionCleanup.job.ts',
  'rebuildDashboardStats.job.ts',
  'index.ts'
]

// ═══════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════

interface TestResult {
  test: string
  status: 'pass' | 'fail'
  details?: string
}

const results: TestResult[] = []

function addResult(test: string, status: 'pass' | 'fail', details?: string) {
  results.push({ test, status, details })
  
  const emoji = status === 'pass' ? '✅' : '❌'
  console.log(`${emoji} ${test}`)
  if (details) {
    console.log(`   ${details}`)
  }
}

function checkFile(filename: string): boolean {
  const filepath = path.join(JOBS_DIR, filename)
  
  if (!fs.existsSync(filepath)) {
    addResult(`${filename} existe`, 'fail', 'Ficheiro não encontrado')
    return false
  }
  
  const content = fs.readFileSync(filepath, 'utf-8')
  
  // Verificar se tem schedule functions ATIVAS (não comentadas)
  const hasActiveSchedule = 
    /export\s+function\s+schedule\w*\s*\([^)]*\)\s*\{/.test(content) ||
    /cron\.schedule\(/.test(content) && !/\/\*[\s\S]*cron\.schedule\([\s\S]*\*\//.test(content)
  
  if (hasActiveSchedule) {
    // Procurar linha específica
    const lines = content.split('\n')
    const scheduleLine = lines.findIndex(line => 
      /schedule/.test(line) && !/\/\//.test(line) && !/\/\*/.test(line)
    )
    
    addResult(
      `${filename} - sem schedule() ativo`,
      'fail',
      `Linha ${scheduleLine + 1} tem schedule ativo!`
    )
    return false
  }
  
  // Verificar se run() foi preservado (exceto index.ts)
  if (filename !== 'index.ts') {
    const hasRun = /export\s+(?:async\s+)?function\s+run\w*/.test(content)
    
    if (!hasRun) {
      addResult(
        `${filename} - run() preservado`,
        'fail',
        'run() foi removido (deveria estar preservado)!'
      )
      return false
    }
    
    addResult(`${filename} - run() preservado`, 'pass')
  }
  
  addResult(`${filename} - sem schedule() ativo`, 'pass')
  return true
}

function checkIndexFile(): boolean {
  const indexPath = path.join(JOBS_DIR, 'index.ts')
  
  if (!fs.existsSync(indexPath)) {
    addResult('index.ts existe', 'fail')
    return false
  }
  
  const content = fs.readFileSync(indexPath, 'utf-8')
  
  // Verificar se .schedule() e .start() estão comentados
  const hasActiveSchedule = /\w+Job\.schedule\(\)(?!\s*\/\/)/.test(content)
  const hasActiveStart = /\w+Job\.start\(\)(?!\s*\/\/)/.test(content)
  
  if (hasActiveSchedule || hasActiveStart) {
    addResult(
      'index.ts - sem chamadas ativas',
      'fail',
      'Tem .schedule() ou .start() não comentados!'
    )
    return false
  }
  
  addResult('index.ts - sem chamadas ativas', 'pass')
  return true
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.clear()
  console.log('═'.repeat(70))
  console.log('🧪 VALIDAR: ZERO JOBS HARDCODED ATIVOS')
  console.log('═'.repeat(70))
  console.log()
  
  // Testar cada ficheiro
  let allPass = true
  
  for (const file of FILES_TO_CHECK) {
    if (file === 'index.ts') {
      if (!checkIndexFile()) allPass = false
    } else {
      if (!checkFile(file)) allPass = false
    }
  }
  
  // Resumo
  console.log()
  console.log('═'.repeat(70))
  console.log('📊 RESUMO')
  console.log('═'.repeat(70))
  console.log()
  
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  
  console.log(`✅ Passou: ${passed}`)
  console.log(`❌ Falhou: ${failed}`)
  console.log(`📝 Total: ${results.length}`)
  console.log()
  
  if (allPass) {
    console.log('═'.repeat(70))
    console.log('🎉 VALIDAÇÃO COMPLETA!')
    console.log('═'.repeat(70))
    console.log()
    console.log('✅ ZERO jobs hardcoded ativos')
    console.log('✅ Funções run() preservadas')
    console.log('✅ Só wizard controla jobs agora')
    console.log()
    console.log('📋 PRÓXIMO PASSO:')
    console.log('   → npx ts-node scripts/list-all-cron-jobs.ts')
    console.log('   → Deves ver ZERO jobs hardcoded')
    console.log()
  } else {
    console.log('═'.repeat(70))
    console.log('❌ VALIDAÇÃO FALHOU!')
    console.log('═'.repeat(70))
    console.log()
    console.log('📋 Erros encontrados:')
    results
      .filter(r => r.status === 'fail')
      .forEach(r => console.log(`   ❌ ${r.test}`))
    console.log()
    console.log('🔧 Corre novamente: npx ts-node scripts/disable-hardcoded-jobs.ts')
    console.log()
    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n❌ ERRO FATAL:', error)
  process.exit(1)
})