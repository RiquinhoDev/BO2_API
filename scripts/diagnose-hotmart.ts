// ════════════════════════════════════════════════════════════
// 🔍 DIAGNÓSTICO HOTMART TIMEOUT
// ════════════════════════════════════════════════════════════
// 
// Executar: npx ts-node diagnose-hotmart.ts
// ════════════════════════════════════════════════════════════

import axios from 'axios'

const API_URL = 'http://localhost:3001'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
}

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function main() {
  log('═'.repeat(70), 'cyan')
  log('🔍 DIAGNÓSTICO HOTMART - TIMEOUT', 'bright')
  log('═'.repeat(70), 'cyan')
  
  log('\n📊 Iniciando diagnóstico detalhado...', 'yellow')
  log('⏱️  Timestamp: ' + new Date().toISOString(), 'cyan')
  
  // Teste 1: Servidor está vivo?
  log('\n🧪 Teste 1: Health Check', 'bright')
  try {
    const health = await axios.get(`${API_URL}/api/health`, { timeout: 5000 })
    log('   ✅ Servidor online', 'green')
  } catch (error) {
    log('   ❌ Servidor offline ou lento', 'red')
    return
  }
  
  // Teste 2: Endpoint responde?
  log('\n🧪 Teste 2: Endpoint Hotmart Universal', 'bright')
  log('   📡 GET /api/hotmart/sync/universal', 'cyan')
  log('   ⏱️  Timeout: 30s', 'cyan')
  
  const startTime = Date.now()
  let lastUpdate = startTime
  
  // Progress logger (a cada 5s)
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    log(`   ⏳ Aguardando... ${elapsed}s`, 'yellow')
  }, 5000)
  
  try {
    const response = await axios.get(`${API_URL}/api/hotmart/sync/universal`, {
      timeout: 30000 // 30s
    })
    
    clearInterval(progressInterval)
    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    log(`\n   ✅ Resposta recebida em ${duration}s!`, 'green')
    log(`   📊 Status: ${response.status}`, 'cyan')
    
    if (response.data?.data?.stats) {
      const s = response.data.data.stats
      log(`   📈 Stats:`, 'cyan')
      log(`      • Total: ${s.total}`, 'cyan')
      log(`      • Inserted: ${s.inserted}`, 'cyan')
      log(`      • Updated: ${s.updated}`, 'cyan')
      log(`      • Errors: ${s.errors}`, 'cyan')
    }
    
    log('\n✅ DIAGNÓSTICO: Endpoint funciona!', 'green')
    log('   💡 Problema pode ser:', 'yellow')
    log('      • Timeout do script de teste muito curto', 'yellow')
    log('      • Dados muito grandes (>4000 users)', 'yellow')
    log('      • Fetch de progresso lento', 'yellow')
    
  } catch (error: any) {
    clearInterval(progressInterval)
    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    if (error.code === 'ECONNABORTED') {
      log(`\n   ❌ TIMEOUT após ${duration}s`, 'red')
      log('\n🔍 DIAGNÓSTICO: Endpoint NÃO responde em 30s', 'red')
      log('   💡 Possíveis causas:', 'yellow')
      log('      1. API Hotmart muito lenta (rate limiting)', 'yellow')
      log('      2. Fetch de progresso travado', 'yellow')
      log('      3. Autenticação falhando', 'yellow')
      log('      4. Loop infinito na paginação', 'yellow')
      
      log('\n📋 PRÓXIMOS PASSOS:', 'bright')
      log('   1. Ver logs do servidor backend', 'cyan')
      log('   2. Desligar includeProgress temporariamente', 'cyan')
      log('   3. Adicionar logs no adapter', 'cyan')
      
    } else {
      log(`\n   ❌ ERRO: ${error.message}`, 'red')
    }
  }
  
  log('\n═'.repeat(70), 'cyan')
  log('✅ Diagnóstico concluído', 'green')
  log('═'.repeat(70), 'cyan')
}

main().catch(console.error)