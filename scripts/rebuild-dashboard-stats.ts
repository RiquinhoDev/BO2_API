// ════════════════════════════════════════════════════════════
// 📁 scripts/rebuild-dashboard-stats.ts
// Script: Forçar rebuild do dashboard stats
// ════════════════════════════════════════════════════════════
// EXECUTAR: npx tsx scripts/rebuild-dashboard-stats.ts
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

const API_URL = process.env.VITE_APP_API_URL || 'http://localhost:3001'

async function rebuildStats() {
  console.log('🔄 Forçando rebuild do dashboard stats...\n')
  console.log(`📡 API: ${API_URL}`)
  console.log('═'.repeat(60))
  
  try {
    // 1. Apagar cache antigo
    console.log('\n🗑️  Passo 1: Apagando cache antigo...')
    
    const deleteResponse = await axios.delete(`${API_URL}/api/dashboard/stats/v3/cache`, {
      timeout: 30000
    })
    
    if (deleteResponse.data.success) {
      console.log('   ✅ Cache apagado!')
    } else {
      console.log('   ⚠️  Cache não encontrado (tudo bem, continuando...)')
    }
    
    // 2. Forçar rebuild
    console.log('\n🔨 Passo 2: Forçando rebuild...')
    
    const rebuildResponse = await axios.post(`${API_URL}/api/dashboard/stats/v3/rebuild`, {}, {
      timeout: 60000
    })
    
    if (rebuildResponse.data.success) {
      console.log('   ✅ Rebuild completo!')
      
      if (rebuildResponse.data.stats) {
        const stats = rebuildResponse.data.stats
        console.log('\n📊 Stats recalculados:')
        console.log(`   Total de Alunos: ${stats.overview?.totalStudents || 'N/A'}`)
        console.log(`   Avg Engagement: ${stats.overview?.avgEngagement?.toFixed(1) || 'N/A'}`)
        console.log(`   Avg Progress: ${stats.overview?.avgProgress?.toFixed(1) || 'N/A'}%`)
        
        if (stats.byPlatform) {
          console.log('\n📦 Por plataforma:')
          stats.byPlatform.forEach((p: any) => {
            console.log(`   ${p.icon} ${p.name}: ${p.count} users (${p.percentage}%)`)
          })
        }
      }
    } else {
      console.error('   ❌ Rebuild falhou!')
    }
    
    // 3. Verificar stats
    console.log('\n🔍 Passo 3: Verificando stats...')
    
    const statsResponse = await axios.get(`${API_URL}/api/dashboard/stats/v3`, {
      timeout: 30000
    })
    
    if (statsResponse.data.success) {
      const meta = statsResponse.data.data.meta
      console.log('   ✅ Stats carregados!')
      console.log(`   Calculado em: ${meta.calculatedAt}`)
      console.log(`   Frescura: ${meta.dataFreshness}`)
      console.log(`   Response time: ${meta.responseTime || meta.durationMs}ms`)
    }
    
    console.log('\n═'.repeat(60))
    console.log('✅ REBUILD COMPLETO!\n')
    
  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    
    if (error.response) {
      console.error('\n📡 Resposta do servidor:')
      console.error(`   Status: ${error.response.status}`)
      console.error(`   Data:`, error.response.data)
    }
    
    console.log('\n💡 Dica: Certifica-te que o servidor está a correr!')
    process.exit(1)
  }
}

rebuildStats()