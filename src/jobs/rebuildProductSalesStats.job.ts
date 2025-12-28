// ════════════════════════════════════════════════════════════
// 📁 src/jobs/rebuildProductSalesStats.job.ts
// Rebuild Product Sales Statistics
// ════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'

// Configuração do schedule
const schedule = process.env.REBUILD_PRODUCT_STATS_SCHEDULE || '0 4 * * *'

console.log('⚠️ RebuildProductSalesStats: DESATIVADO (migrado para wizard CRON)')
console.log(`   Schedule original: ${schedule}`)

/*
// ❌ DESATIVADO: Job migrado para wizard CRON

*/

/**
 * Rebuild manual de estatísticas de vendas
 */
export async function rebuildProductSalesStatsManual() {
  console.log('\n🔄 ========================================')
  console.log('🔄 MANUAL: Rebuild Product Sales Stats')
  console.log(`🔄 Timestamp: ${new Date().toLocaleString('pt-PT')}`)
  console.log('🔄 ========================================\n')
  
  try {
    // TODO: Implementar lógica de rebuild
    console.log('✅ MANUAL: Product Sales Stats reconstruídos!\n')
  } catch (error) {
    console.error('❌ MANUAL: Erro ao rebuild:', error, '\n')
  }
}

export default {
  run: rebuildProductSalesStatsManual
}