// ════════════════════════════════════════════════════════════
// 🔍 DIAGNÓSTICO SYNCHISTORY - CURSEDUCA
// ════════════════════════════════════════════════════════════
// 
// Executar: npx ts-node diagnose-synchistory.ts
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { SyncHistory } from '../src/models'


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
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

function separator() {
  console.log(colors.cyan + '═'.repeat(80) + colors.reset)
}

async function main() {
  separator()
  log('🔍 DIAGNÓSTICO SYNCHISTORY - CURSEDUCA', 'bright')
  separator()
  
  // Conectar MongoDB
  const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true'
  log(`\n📦 Conectando ao MongoDB...`, 'cyan')
  log(`   URI: ${MONGO_URI}`, 'cyan')
  
  await mongoose.connect(MONGO_URI)
  log('✅ Conectado!', 'green')
  
  // ═══════════════════════════════════════════════════════════
  // 1. BUSCAR TODOS OS SYNCHISTORY (SEM FILTRO)
  // ═══════════════════════════════════════════════════════════
  
  log('\n📊 1. TODOS os SyncHistory (últimos 20):', 'bright')
  
  const allHistory = await SyncHistory.find()
    .sort({ startedAt: -1 })
    .limit(20)
    .select('type syncType status startedAt stats')
    .lean()
  
  log(`   Total encontrados: ${allHistory.length}`, 'cyan')
  
  if (allHistory.length > 0) {
    log('\n   Primeiros 5:', 'yellow')
    allHistory.slice(0, 5).forEach((h: any, i: number) => {
      log(`   ${i + 1}. type: "${h.type || 'null'}" | syncType: "${h.syncType || 'null'}" | status: ${h.status}`, 'cyan')
      log(`      stats: ${JSON.stringify(h.stats)}`, 'cyan')
    })
  }
  
  // ═══════════════════════════════════════════════════════════
  // 2. BUSCAR COM DIFERENTES QUERIES (TESTAR CADA UMA)
  // ═══════════════════════════════════════════════════════════
  
  log('\n📊 2. TESTANDO QUERIES:', 'bright')
  
  const queries = [
    { name: 'type: "curseduca"', query: { type: 'curseduca' } },
    { name: 'type: "CURSEDUCA"', query: { type: 'CURSEDUCA' } },
    { name: 'syncType: "curseduca"', query: { syncType: 'curseduca' } },
    { name: 'syncType: "CURSEDUCA"', query: { syncType: 'CURSEDUCA' } },
    { name: '$or (flexível)', query: { 
      $or: [
        { type: 'curseduca' },
        { type: 'CURSEDUCA' },
        { syncType: 'curseduca' },
        { syncType: 'CURSEDUCA' }
      ]
    }}
  ]
  
  for (const { name, query } of queries) {
    const results = await SyncHistory.find(query)
      .sort({ startedAt: -1 })
      .limit(1)
      .select('type syncType status stats startedAt')
      .lean()
    
    if (results.length > 0) {
      const r = results[0] as any
      log(`   ✅ ${name}: ENCONTRADO!`, 'green')
      log(`      • type: "${r.type}"`, 'cyan')
      log(`      • syncType: "${r.syncType || 'undefined'}"`, 'cyan')
      log(`      • status: ${r.status}`, 'cyan')
      log(`      • stats: ${JSON.stringify(r.stats)}`, 'cyan')
    } else {
      log(`   ❌ ${name}: NÃO encontrado`, 'red')
    }
  }
  
  // ═══════════════════════════════════════════════════════════
  // 3. CONTAR POR TYPE/SYNCTYPE
  // ═══════════════════════════════════════════════════════════
  
  log('\n📊 3. CONTAGEM POR CAMPO:', 'bright')
  
  const byType = await SyncHistory.aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
  
  log('   Por type:', 'yellow')
  byType.forEach((item: any) => {
    log(`      • "${item._id}": ${item.count}`, 'cyan')
  })
  
  const bySyncType = await SyncHistory.aggregate([
    { $group: { _id: '$syncType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
  
  log('   Por syncType:', 'yellow')
  bySyncType.forEach((item: any) => {
    log(`      • "${item._id}": ${item.count}`, 'cyan')
  })
  
  // ═══════════════════════════════════════════════════════════
  // 4. BUSCAR ÚLTIMO SYNC UNIVERSAL (QUALQUER TIPO)
  // ═══════════════════════════════════════════════════════════
  
  log('\n📊 4. ÚLTIMOS SYNCS (todos tipos):', 'bright')
  
  const recentSyncs = await SyncHistory.find()
    .sort({ startedAt: -1 })
    .limit(10)
    .select('type syncType status startedAt completedAt stats triggeredBy')
    .lean()
  
  recentSyncs.forEach((sync: any, i: number) => {
    const duration = sync.completedAt && sync.startedAt
      ? Math.floor((new Date(sync.completedAt).getTime() - new Date(sync.startedAt).getTime()) / 1000)
      : 0
    
    log(`   ${i + 1}. ${sync.type || sync.syncType || 'unknown'} - ${sync.status}`, 'cyan')
    log(`      • Started: ${new Date(sync.startedAt).toLocaleString('pt-PT')}`, 'cyan')
    log(`      • Duration: ${duration}s`, 'cyan')
    log(`      • Stats: ${JSON.stringify(sync.stats)}`, 'cyan')
    log(`      • Triggered: ${sync.triggeredBy?.type || 'unknown'}`, 'cyan')
  })
  
  // ═══════════════════════════════════════════════════════════
  // 5. VERIFICAR SCHEMA DO MODELO
  // ═══════════════════════════════════════════════════════════
  
  log('\n📊 5. SCHEMA SYNCHISTORY:', 'bright')
  
  const schema = SyncHistory.schema.paths
  log('   Campos definidos no schema:', 'yellow')
  
  const relevantFields = ['type', 'syncType', 'status', 'stats', 'triggeredBy']
  relevantFields.forEach(field => {
    if (schema[field]) {
      log(`      • ${field}: ${schema[field].instance || 'Mixed'}`, 'cyan')
    } else {
      log(`      • ${field}: ❌ NÃO DEFINIDO`, 'red')
    }
  })
  
  // ═══════════════════════════════════════════════════════════
  // 6. ANÁLISE E RECOMENDAÇÕES
  // ═══════════════════════════════════════════════════════════
  
  separator()
  log('📋 ANÁLISE:', 'bright')
  separator()
  
  const curseducaWithOr = await SyncHistory.countDocuments({ 
    $or: [
      { type: 'curseduca' },
      { type: 'CURSEDUCA' },
      { syncType: 'curseduca' },
      { syncType: 'CURSEDUCA' }
    ]
  })
  
  if (curseducaWithOr > 0) {
    log(`\n✅ ENCONTRADOS ${curseducaWithOr} registos CursEduca`, 'green')
    log('   💡 O controller está CORRETO com $or query', 'cyan')
    log('   💡 Problema está no SCRIPT DE TESTE', 'yellow')
    
    // Descobrir qual campo/valor específico
    const sample = await SyncHistory.findOne({ 
      $or: [
        { type: 'curseduca' },
        { type: 'CURSEDUCA' },
        { syncType: 'curseduca' },
        { syncType: 'CURSEDUCA' }
      ]
    }).lean()
    
    if (sample) {
      log('\n   📝 Formato exato encontrado:', 'bright')
      log(`      • type: "${(sample as any).type}"`, 'magenta')
      log(`      • syncType: "${(sample as any).syncType || 'undefined'}"`, 'magenta')
      
      if ((sample as any).type) {
        log('\n   ✅ SOLUÇÃO: Usar campo "type"', 'green')
        log(`   📋 Query recomendada: { type: '${(sample as any).type}' }`, 'cyan')
      } else if ((sample as any).syncType) {
        log('\n   ✅ SOLUÇÃO: Usar campo "syncType"', 'green')
        log(`   📋 Query recomendada: { syncType: '${(sample as any).syncType}' }`, 'cyan')
      }
    }
    
  } else {
    log(`\n❌ NENHUM registo CursEduca encontrado`, 'red')
    log('   💡 Possíveis causas:', 'yellow')
    log('      1. Sync ainda não executou com status completed', 'cyan')
    log('      2. Campo usa nome diferente', 'cyan')
    log('      3. Registos foram apagados', 'cyan')
  }
  
  separator()
  log('✅ Diagnóstico concluído!', 'green')
  separator()
  
  await mongoose.disconnect()
}

main().catch(console.error)