// ════════════════════════════════════════════════════════════
// 📁 scripts/force-curseduca-sync.ts
// Script: Forçar sync CursEDuca e verificar UserProducts criados
// ════════════════════════════════════════════════════════════
// EXECUTAR: npx tsx scripts/force-curseduca-sync.ts
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_APP_API_URL || 'http://localhost:3001'

async function forceCursEducaSync() {
  console.log('🔄 Forçando sincronização CursEDuca...\n')
  console.log(`📡 API: ${API_URL}`)
  console.log('═'.repeat(60))
  
  try {
    // 1. Verificar estado ANTES do sync
    console.log('\n📊 ANTES DO SYNC:')
    console.log('   (Executando diagnóstico...)')
    
    // Não executamos diagnóstico aqui para não complicar
    // O user pode executar manualmente: npx tsx scripts/diagnostico-curseduca.ts
    
    // 2. Executar sync
    console.log('\n🚀 Iniciando sincronização...')
    console.log('   (Isto pode demorar alguns minutos...)\n')
    
    const startTime = Date.now()
    
    const syncResponse = await axios.post(
      `${API_URL}/api/curseduca/sync/universal`,
      {},
      {
        timeout: 300000 // 5 minutos
      }
    )
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    
    if (syncResponse.data.success) {
      console.log('\n✅ SYNC COMPLETO!')
      console.log(`   Duração: ${duration}s`)
      
      const stats = syncResponse.data.stats
      if (stats) {
        console.log('\n📊 Estatísticas:')
        console.log(`   Total processado: ${stats.total || 0}`)
        console.log(`   ✨ Inseridos: ${stats.inserted || 0}`)
        console.log(`   🔄 Atualizados: ${stats.updated || 0}`)
        console.log(`   ⏭️  Ignorados: ${stats.skipped || 0}`)
        console.log(`   ❌ Erros: ${stats.errors || 0}`)
      }
      
      // Mostrar warnings se existirem
      if (syncResponse.data.warnings && syncResponse.data.warnings.length > 0) {
        console.log('\n⚠️  Warnings:')
        syncResponse.data.warnings.slice(0, 5).forEach((w: any) => {
          console.log(`   - ${w.message}`)
        })
        if (syncResponse.data.warnings.length > 5) {
          console.log(`   ... e mais ${syncResponse.data.warnings.length - 5} warnings`)
        }
      }
      
      // Mostrar erros se existirem
      if (syncResponse.data.errors && syncResponse.data.errors.length > 0) {
        console.log('\n❌ Erros:')
        syncResponse.data.errors.slice(0, 5).forEach((e: any) => {
          console.log(`   - ${e.message} (${e.userEmail || 'N/A'})`)
        })
        if (syncResponse.data.errors.length > 5) {
          console.log(`   ... e mais ${syncResponse.data.errors.length - 5} erros`)
        }
      }
      
    } else {
      console.error('\n❌ SYNC FALHOU!')
      console.error('   Mensagem:', syncResponse.data.message)
    }
    
    console.log('\n═'.repeat(60))
    console.log('✅ PROCESSO COMPLETO!')
    console.log('\n💡 Próximo passo: Executar diagnóstico')
    console.log('   npx tsx scripts/diagnostico-curseduca.ts\n')
    
  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    
    if (error.response) {
      console.error('\n📡 Resposta do servidor:')
      console.error(`   Status: ${error.response.status}`)
      console.error(`   Data:`, error.response.data)
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Servidor não está a responder!')
      console.error('   Certifica-te que o servidor está a correr: yarn dev')
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n⏱️  Timeout!')
      console.error('   O sync pode estar a demorar muito.')
      console.error('   Verifica os logs do servidor.')
    }
    
    process.exit(1)
  }
}

forceCursEducaSync()