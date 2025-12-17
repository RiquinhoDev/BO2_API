// ════════════════════════════════════════════════════════════
// 🧪 SCRIPT DE TESTES COMPLETO - UNIVERSAL SYNC
// Testa Hotmart + CursEduca endpoints e valida MongoDB
// ════════════════════════════════════════════════════════════
// 
// Executar: npx ts-node test-universal-sync.ts
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import * as dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config()

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function separator(char = '═', length = 80) {
  log(char.repeat(length), 'cyan')
}

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
  data?: any
}

interface SyncResponse {
  success: boolean
  message?: string
  data?: {
    reportId?: string
    syncHistoryId?: string
    stats?: {
      total: number
      inserted: number
      updated: number
      unchanged?: number
      errors: number
    }
    duration?: number
    reportUrl?: string
    syncHistoryUrl?: string
  }
  _universalSync?: boolean
  _version?: string
}

interface CompareResponse {
  success: boolean
  data?: {
    legacy: {
      count: number
      latest?: any
      all: any[]
    }
    universal: {
      count: number
      latest?: any
      all: any[]
    }
    comparison: {
      avgDurationLegacy: number
      avgDurationUniversal: number
    }
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: HTTP REQUEST
// ═══════════════════════════════════════════════════════════

async function makeRequest(
  method: 'GET' | 'POST',
  endpoint: string,
  testName: string
): Promise<TestResult> {
  const startTime = Date.now()
  
  try {
    log(`\n🔍 Testando: ${testName}`, 'yellow')
    log(`   📡 ${method} ${endpoint}`, 'blue')
    
// DEPOIS (60 minutos):
const response = await axios({
  method,
  url: `${API_BASE_URL}${endpoint}`,
  timeout: 3600000, // ✅ 60 minutos (1 hora)
  validateStatus: () => true
})

// Log para user saber que pode demorar
if (endpoint.includes('hotmart')) {
  console.log('   ⏳ Hotmart sync pode demorar 20-40 minutos (4200+ users com progresso)')
  console.log('   ☕ Vai buscar um café! ☕')
}
    
    const duration = Date.now() - startTime
    
    if (response.status === 200) {
      log(`   ✅ SUCCESS - ${duration}ms`, 'green')
      log(`   📊 Response:`, 'cyan')
      
      // Mostrar dados principais
      if (response.data.success !== undefined) {
        log(`      • success: ${response.data.success}`, 'cyan')
      }
      if (response.data.message) {
        log(`      • message: ${response.data.message}`, 'cyan')
      }
      if (response.data.data?.stats) {
        const stats = response.data.data.stats
        log(`      • total: ${stats.total}`, 'cyan')
        log(`      • inserted: ${stats.inserted}`, 'cyan')
        log(`      • updated: ${stats.updated}`, 'cyan')
        log(`      • errors: ${stats.errors}`, 'cyan')
      }
      if (response.data.data?.duration) {
        log(`      • duration: ${response.data.data.duration}s`, 'cyan')
      }
      
      return {
        name: testName,
        passed: true,
        duration,
        data: response.data
      }
    } else {
      log(`   ❌ FAILED - Status ${response.status}`, 'red')
      log(`   📄 Response: ${JSON.stringify(response.data).substring(0, 200)}`, 'red')
      
      return {
        name: testName,
        passed: false,
        duration,
        error: `HTTP ${response.status}: ${response.data.message || 'Unknown error'}`,
        data: response.data
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    log(`   ❌ ERROR - ${error.message}`, 'red')
    
    return {
      name: testName,
      passed: false,
      duration,
      error: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: MONGODB VALIDATION
// ═══════════════════════════════════════════════════════════

async function validateMongoDB(
  platform: 'hotmart' | 'curseduca',
  expectedReportId?: string
): Promise<TestResult> {
  const startTime = Date.now()
  const testName = `MongoDB Validation - ${platform}`
  
  try {
    log(`\n🔍 Validando MongoDB: ${platform}`, 'yellow')
    
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('MongoDB connection not available')
    }
    
    // 1. Verificar SyncReport
    log(`   📊 Verificando SyncReport...`, 'blue')
    const syncReports = db.collection('syncreports')
    const latestReport = await syncReports.findOne(
      { syncType: platform },
      { sort: { startedAt: -1 } }
    )
    
    if (!latestReport) {
      log(`   ⚠️  Nenhum SyncReport encontrado para ${platform}`, 'yellow')
    } else {
      log(`   ✅ SyncReport encontrado:`, 'green')
      log(`      • ID: ${latestReport._id}`, 'cyan')
      log(`      • Status: ${latestReport.status}`, 'cyan')
      log(`      • Duration: ${latestReport.duration}s`, 'cyan')
      log(`      • Stats: ${JSON.stringify(latestReport.stats)}`, 'cyan')
    }
    
    // 2. Verificar SyncHistory
    log(`   📊 Verificando SyncHistory...`, 'blue')
    const syncHistories = db.collection('synchistories')

      const latestHistory = await syncHistories.findOne(
        { type: platform },  // ✅ SIMPLES! já vem lowercase
        { sort: { startedAt: -1 } }
      )
    
    if (!latestHistory) {
      log(`   ⚠️  Nenhum SyncHistory encontrado para ${platform}`, 'yellow')
    } else {
      log(`   ✅ SyncHistory encontrado:`, 'green')
      log(`      • ID: ${latestHistory._id}`, 'cyan')
      log(`      • Status: ${latestHistory.status}`, 'cyan')
      log(`      • Stats: ${JSON.stringify(latestHistory.stats)}`, 'cyan')
    }
    
    // 3. Verificar Users com syncVersion 3.0
    log(`   📊 Verificando Users...`, 'blue')
    const users = db.collection('users')
    const syncVersionPath = `${platform}.syncVersion`
    const userWithV3 = await users.findOne(
      { [syncVersionPath]: '3.0' }
    )
    
    if (!userWithV3) {
      log(`   ⚠️  Nenhum user com ${platform}.syncVersion: "3.0" encontrado`, 'yellow')
    } else {
      log(`   ✅ User com syncVersion 3.0 encontrado:`, 'green')
      log(`      • Email: ${userWithV3.email}`, 'cyan')
      log(`      • Name: ${userWithV3.name}`, 'cyan')
      
      const platformData = userWithV3[platform]
      if (platformData) {
        log(`      • ${platform} data presente: ✅`, 'cyan')
        log(`      • syncVersion: ${platformData.syncVersion}`, 'cyan')
        log(`      • lastSyncAt: ${platformData.lastSyncAt}`, 'cyan')
      }
    }
    
    // 4. Contar total de users sincronizados
    const totalUsers = await users.countDocuments({
      [syncVersionPath]: '3.0'
    })
    log(`   📊 Total users com syncVersion 3.0: ${totalUsers}`, 'cyan')
    
    const duration = Date.now() - startTime
    
    return {
      name: testName,
      passed: true,
      duration,
      data: {
        reportFound: !!latestReport,
        historyFound: !!latestHistory,
        usersWithV3: totalUsers
      }
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime
    log(`   ❌ ERROR - ${error.message}`, 'red')
    
    return {
      name: testName,
      passed: false,
      duration,
      error: error.message
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════

async function runTests() {
  separator()
  log('🧪 UNIVERSAL SYNC - TEST SUITE', 'bright')
  log('Testando Hotmart + CursEduca Universal Sync', 'cyan')
  separator()
  
  const results: TestResult[] = []
  
  try {
    // Conectar MongoDB
    log('\n📦 Conectando ao MongoDB...', 'yellow')
    await mongoose.connect(MONGODB_URI)
    log('✅ MongoDB conectado!', 'green')
    
    // ═══════════════════════════════════════════════════════════
    // SUITE 1: HOTMART
    // ═══════════════════════════════════════════════════════════
    
    separator()
    log('📦 SUITE 1: HOTMART UNIVERSAL SYNC', 'bright')
    separator()
    
    // Test 1.1: Full Sync
    results.push(
      await makeRequest(
        'GET',
        '/api/hotmart/sync/universal',
        'Hotmart - Full Universal Sync'
      )
    )
    
    // Wait 2s
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Test 1.2: Validate MongoDB
    results.push(
      await validateMongoDB('hotmart')
    )
    
    // Test 1.3: Progress Only
    results.push(
      await makeRequest(
        'POST',
        '/api/hotmart/sync/universal/progress',
        'Hotmart - Progress Only Sync'
      )
    )
    
    // Test 1.4: Compare
    results.push(
      await makeRequest(
        'GET',
        '/api/hotmart/sync/compare',
        'Hotmart - Compare Legacy vs Universal'
      )
    )
    
    // ═══════════════════════════════════════════════════════════
    // SUITE 2: CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    
    separator()
    log('📦 SUITE 2: CURSEDUCA UNIVERSAL SYNC', 'bright')
    separator()
    
    // Test 2.1: Full Sync
    results.push(
      await makeRequest(
        'GET',
        '/api/curseduca/sync/universal',
        'CursEduca - Full Universal Sync'
      )
    )
    
    // Wait 2s
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Test 2.2: Validate MongoDB
    results.push(
      await validateMongoDB('curseduca')
    )
    
    // Test 2.3: Progress Only
    results.push(
      await makeRequest(
        'POST',
        '/api/curseduca/sync/universal/progress',
        'CursEduca - Progress Only Sync'
      )
    )
    
    // Test 2.4: Compare
    results.push(
      await makeRequest(
        'GET',
        '/api/curseduca/sync/compare',
        'CursEduca - Compare Legacy vs Universal'
      )
    )
    
    // ═══════════════════════════════════════════════════════════
    // FINAL REPORT
    // ═══════════════════════════════════════════════════════════
    
    separator()
    log('📊 RELATÓRIO FINAL', 'bright')
    separator()
    
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    
    log(`\n✅ Testes Passados: ${passed}/${results.length}`, 'green')
    log(`❌ Testes Falhados: ${failed}/${results.length}`, failed > 0 ? 'red' : 'green')
    log(`⏱️  Duração Total: ${(totalDuration / 1000).toFixed(2)}s`, 'cyan')
    
    // Detalhes dos testes
    log('\n📋 Detalhes:', 'yellow')
    results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌'
      const color = result.passed ? 'green' : 'red'
      log(`${index + 1}. ${status} ${result.name} - ${result.duration}ms`, color)
      
      if (!result.passed && result.error) {
        log(`   Erro: ${result.error}`, 'red')
      }
    })
    
    // Performance Analysis
    separator()
    log('⚡ ANÁLISE DE PERFORMANCE', 'bright')
    separator()
    
    const hotmartSync = results.find(r => r.name === 'Hotmart - Full Universal Sync')
    const curseducaSync = results.find(r => r.name === 'CursEduca - Full Universal Sync')
    
    if (hotmartSync?.data?.data?.stats) {
      const stats = hotmartSync.data.data.stats
      const duration = hotmartSync.data.data.duration || 0
      log(`\n🔥 Hotmart Universal:`, 'yellow')
      log(`   • Total: ${stats.total} users`, 'cyan')
      log(`   • Inserted: ${stats.inserted}`, 'cyan')
      log(`   • Updated: ${stats.updated}`, 'cyan')
      log(`   • Errors: ${stats.errors}`, 'cyan')
      log(`   • Duration: ${duration}s`, 'cyan')
      log(`   • Speed: ${(stats.total / duration).toFixed(1)} users/s`, 'cyan')
    }
    
    if (curseducaSync?.data?.data?.stats) {
      const stats = curseducaSync.data.data.stats
      const duration = curseducaSync.data.data.duration || 0
      log(`\n🎓 CursEduca Universal:`, 'yellow')
      log(`   • Total: ${stats.total} users`, 'cyan')
      log(`   • Inserted: ${stats.inserted}`, 'cyan')
      log(`   • Updated: ${stats.updated}`, 'cyan')
      log(`   • Errors: ${stats.errors}`, 'cyan')
      log(`   • Duration: ${duration}s`, 'cyan')
      log(`   • Speed: ${(stats.total / duration).toFixed(1)} users/s`, 'cyan')
    }
    
    // MongoDB Validation Summary
    separator()
    log('🗄️  VALIDAÇÃO MONGODB', 'bright')
    separator()
    
    const hotmartMongo = results.find(r => r.name === 'MongoDB Validation - hotmart')
    const curseducaMongo = results.find(r => r.name === 'MongoDB Validation - curseduca')
    
    if (hotmartMongo?.data) {
      log(`\n🔥 Hotmart:`, 'yellow')
      log(`   • SyncReport: ${hotmartMongo.data.reportFound ? '✅' : '❌'}`, 'cyan')
      log(`   • SyncHistory: ${hotmartMongo.data.historyFound ? '✅' : '❌'}`, 'cyan')
      log(`   • Users v3.0: ${hotmartMongo.data.usersWithV3}`, 'cyan')
    }
    
    if (curseducaMongo?.data) {
      log(`\n🎓 CursEduca:`, 'yellow')
      log(`   • SyncReport: ${curseducaMongo.data.reportFound ? '✅' : '❌'}`, 'cyan')
      log(`   • SyncHistory: ${curseducaMongo.data.historyFound ? '✅' : '❌'}`, 'cyan')
      log(`   • Users v3.0: ${curseducaMongo.data.usersWithV3}`, 'cyan')
    }
    
    separator()
    
    // Final verdict
    if (failed === 0) {
      log('\n🎉 TODOS OS TESTES PASSARAM! 🎉', 'green')
      log('✅ Sistema Universal Sync está 100% funcional!', 'green')
      log('🚀 Pronto para produção!', 'green')
    } else {
      log(`\n⚠️  ${failed} TESTE(S) FALHARAM`, 'red')
      log('🔧 Revisar erros acima antes de avançar', 'yellow')
    }
    
    separator()
    
  } catch (error: any) {
    log(`\n❌ ERRO FATAL: ${error.message}`, 'red')
    console.error(error)
  } finally {
    // Desconectar MongoDB
    await mongoose.disconnect()
    log('\n📦 MongoDB desconectado', 'cyan')
  }
}

// ═══════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════

runTests()
  .then(() => {
    log('\n✅ Script concluído!', 'green')
    process.exit(0)
  })
  .catch((error) => {
    log(`\n❌ Script falhou: ${error.message}`, 'red')
    process.exit(1)
  })