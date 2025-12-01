// ════════════════════════════════════════════════════════════
// 📁 src/jobs/rebuildProductSalesStats.job.ts
// CRON JOB: Rebuild Product Sales Stats
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import { buildProductSalesStats } from '../services/productSalesStatsBuilder'


let isRunning = false

// ─────────────────────────────────────────────────────────────
// CRON JOB PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function startRebuildProductSalesStatsJob() {
  // Rodar todos os dias às 02:00 da manhã
  const schedule = '0 2 * * *'
  
  console.log('🕐 [CRON] Product Sales Stats Rebuild agendado: Todos os dias às 02:00')
  
  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('⏳ [CRON] Product Sales Stats rebuild já está em execução, pulando...')
      return
    }
    
    isRunning = true
    
    try {
      console.log('\n🔄 [CRON] Iniciando rebuild de Product Sales Stats...')
      const startTime = Date.now()
      
      await buildProductSalesStats()
      
      const duration = Math.round((Date.now() - startTime) / 1000)
      console.log(`✅ [CRON] Product Sales Stats rebuild completado em ${duration}s`)
      
    } catch (error) {
      console.error('❌ [CRON] Erro ao fazer rebuild de Product Sales Stats:', error)
    } finally {
      isRunning = false
    }
  })
}

// ─────────────────────────────────────────────────────────────
// REBUILD MANUAL
// ─────────────────────────────────────────────────────────────

export async function rebuildProductSalesStatsManual(): Promise<void> {
  if (isRunning) {
    console.log('⏳ Product Sales Stats rebuild já está em execução')
    return
  }
  
  isRunning = true
  
  try {
    console.log('🔄 [MANUAL] Iniciando rebuild de Product Sales Stats...')
    
    await buildProductSalesStats()
    
    console.log('✅ [MANUAL] Product Sales Stats rebuild completado')
  } catch (error) {
    console.error('❌ [MANUAL] Erro ao fazer rebuild:', error)
    throw error
  } finally {
    isRunning = false
  }
}

export default {
  startRebuildProductSalesStatsJob,
  rebuildProductSalesStatsManual
}