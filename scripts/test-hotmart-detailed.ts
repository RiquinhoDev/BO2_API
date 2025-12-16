// ════════════════════════════════════════════════════════════
// 🔬 TESTE DETALHADO HOTMART - COM BREAKPOINTS
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
  magenta: '\x1b[35m'
}

function log(msg: string, color: keyof typeof colors = 'reset') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
  console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`)
}

function separator() {
  console.log(colors.cyan + '═'.repeat(70) + colors.reset)
}

// Timer helper
class Timer {
  private start: number
  
  constructor() {
    this.start = Date.now()
  }
  
  elapsed(): string {
    const ms = Date.now() - this.start
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  
  elapsedMs(): number {
    return Date.now() - this.start
  }
}

async function testWithTimeout(
  name: string,
  fn: () => Promise<any>,
  timeoutMs: number
): Promise<{ success: boolean; data?: any; error?: string; duration: number }> {
  const timer = new Timer()
  
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      )
    ])
    
    return {
      success: true,
      data: result,
      duration: timer.elapsedMs()
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      duration: timer.elapsedMs()
    }
  }
}

async function main() {
  separator()
  log('🔬 TESTE DETALHADO HOTMART - BREAKPOINT ANALYSIS', 'bright')
  separator()
  
  const totalTimer = new Timer()
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 1: Servidor básico
  // ═══════════════════════════════════════════════════════════
  
  log('\n🧪 TESTE 1: Health Check', 'bright')
  const healthTimer = new Timer()
  
  try {
    await axios.get(`${API_URL}/api/health`, { timeout: 5000 })
    log(`✅ Servidor online (${healthTimer.elapsed()})`, 'green')
  } catch (error) {
    log(`❌ Servidor offline`, 'red')
    return
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 2: Hotmart Compare (rápido)
  // ═══════════════════════════════════════════════════════════
  
  log('\n🧪 TESTE 2: Compare Endpoint (baseline)', 'bright')
  const compareTimer = new Timer()
  
  try {
    const res = await axios.get(`${API_URL}/api/hotmart/sync/compare`, { timeout: 5000 })
    log(`✅ Compare funciona (${compareTimer.elapsed()})`, 'green')
    log(`   📊 Legacy syncs: ${res.data.data?.legacy?.count || 0}`, 'cyan')
    log(`   📊 Universal syncs: ${res.data.data?.universal?.count || 0}`, 'cyan')
  } catch (error: any) {
    log(`❌ Compare falhou: ${error.message}`, 'red')
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 3: Hotmart Universal (com monitoring)
  // ═══════════════════════════════════════════════════════════
  
  log('\n🧪 TESTE 3: Hotmart Universal Sync (MONITORADO)', 'bright')
  log('   📡 Endpoint: GET /api/hotmart/sync/universal', 'cyan')
  log('   ⏱️  Timeout: 60s (1 minuto)', 'cyan')
  log('   🔍 Monitoring a cada 3 segundos...', 'cyan')
  
  const syncTimer = new Timer()
  let lastElapsed = 0
  
  // Progress monitor
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor(syncTimer.elapsedMs() / 1000)
    if (elapsed > lastElapsed) {
      lastElapsed = elapsed
      log(`   ⏳ ${elapsed}s...`, 'yellow')
    }
  }, 3000)
  
  try {
    const response = await axios.get(`${API_URL}/api/hotmart/sync/universal`, {
      timeout: 60000 // 60s
    })
    
    clearInterval(progressInterval)
    
    log(`\n✅ SUCESSO! (${syncTimer.elapsed()})`, 'green')
    
    if (response.data?.data?.stats) {
      const s = response.data.data.stats
      log(`   📊 Stats:`, 'cyan')
      log(`      • Total: ${s.total}`, 'cyan')
      log(`      • Inserted: ${s.inserted}`, 'cyan')
      log(`      • Updated: ${s.updated}`, 'cyan')
      log(`      • Errors: ${s.errors}`, 'cyan')
      log(`      • Duration: ${response.data.data.duration}s`, 'cyan')
    }
    
    // Análise de performance
    log('\n📈 ANÁLISE:', 'bright')
    const totalSecs = syncTimer.elapsedMs() / 1000
    const stats = response.data.data.stats
    
    if (stats && stats.total > 0) {
      const usersPerSec = stats.total / totalSecs
      log(`   ⚡ Velocidade: ${usersPerSec.toFixed(1)} users/s`, 'magenta')
      
      if (usersPerSec < 10) {
        log(`   ⚠️  MUITO LENTO! (<10 users/s)`, 'yellow')
        log(`   💡 Problema provável: Fetch de progresso`, 'yellow')
      } else if (usersPerSec < 50) {
        log(`   ⚠️  Lento (10-50 users/s)`, 'yellow')
        log(`   💡 Pode melhorar com otimizações`, 'yellow')
      } else {
        log(`   ✅ Velocidade boa! (>50 users/s)`, 'green')
      }
    }
    
  } catch (error: any) {
    clearInterval(progressInterval)
    
    if (error.code === 'ECONNABORTED') {
      log(`\n❌ TIMEOUT após ${syncTimer.elapsed()}`, 'red')
      
      // Query MongoDB para ver o estado
      log('\n🔍 Verificando MongoDB...', 'yellow')
      
      try {
        // Tentar ver SyncReport via API
        const reportsRes = await axios.get(`${API_URL}/api/sync/reports`, { 
          timeout: 5000 
        }).catch(() => null)
        
        if (reportsRes?.data) {
          log('   📊 Último SyncReport:', 'cyan')
          const latest = reportsRes.data.reports?.[0]
          if (latest) {
            log(`      • Status: ${latest.status}`, 'cyan')
            log(`      • Stats: ${JSON.stringify(latest.stats)}`, 'cyan')
          }
        }
      } catch (e) {
        log('   ⚠️  Não conseguiu verificar MongoDB', 'yellow')
      }
      
    } else {
      log(`\n❌ ERRO: ${error.message}`, 'red')
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // TESTE 4: MongoDB direto (se possível)
  // ═══════════════════════════════════════════════════════════
  
  log('\n🧪 TESTE 4: Verificar estado MongoDB', 'bright')
  
  try {
    // Tentar buscar últimos SyncReports
    const reports = await axios.get(`${API_URL}/api/sync/reports?limit=3`, {
      timeout: 5000
    }).catch(() => null)
    
    if (reports?.data?.reports) {
      log(`   ✅ Últimos 3 SyncReports:`, 'green')
      reports.data.reports.forEach((r: any, i: number) => {
        const duration = r.duration || 0
        const status = r.status || 'unknown'
        const total = r.stats?.total || 0
        log(`      ${i + 1}. ${status} - ${total} users - ${duration}s`, 'cyan')
      })
    }
  } catch (e) {
    log(`   ⚠️  Endpoint /sync/reports não disponível`, 'yellow')
  }
  
  // ═══════════════════════════════════════════════════════════
  // DIAGNÓSTICO FINAL
  // ═══════════════════════════════════════════════════════════
  
  separator()
  log('\n📋 DIAGNÓSTICO FINAL', 'bright')
  separator()
  
  log(`\n⏱️  Tempo total: ${totalTimer.elapsed()}`, 'cyan')
  
  log('\n🔍 CONCLUSÕES:', 'bright')
  
  if (syncTimer.elapsedMs() >= 60000) {
    log('\n❌ Endpoint faz TIMEOUT consistente (>60s)', 'red')
    log('\n💡 CAUSA PROVÁVEL:', 'yellow')
    log('   1. Fetch de progresso MUITO lento', 'yellow')
    log('   2. Rate limiting da API Hotmart', 'yellow')
    log('   3. 4000+ users × 500ms/user = 33+ minutos!', 'yellow')
    
    log('\n🔧 SOLUÇÕES RECOMENDADAS:', 'bright')
    log('   A. DESLIGAR includeProgress (teste)', 'magenta')
    log('   B. Reduzir concurrency (5→1)', 'magenta')
    log('   C. Adicionar rate limiting (1s entre batches)', 'magenta')
    log('   D. Processar apenas 100 users (limite de teste)', 'magenta')
    
  } else if (syncTimer.elapsedMs() > 0) {
    const secs = syncTimer.elapsedMs() / 1000
    log(`\n✅ Endpoint FUNCIONA mas é lento (${secs.toFixed(1)}s)`, 'yellow')
    log('\n💡 RECOMENDAÇÃO:', 'yellow')
    log('   • Aumentar timeout do teste para 10-15 minutos', 'magenta')
    log('   • Ou otimizar fetch de progresso', 'magenta')
  }
  
  separator()
  log('✅ Análise completa!', 'green')
  separator()
}

main().catch(console.error)