// ═══════════════════════════════════════════════════════════════════════════
// ⏰ CRON JOB: Rebuild Dashboard Stats
// ═══════════════════════════════════════════════════════════════════════════
// Reconstrói stats do dashboard periodicamente
// Execução: Todos os dias às 03:00 + a cada 6 horas
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import { buildDashboardStats } from '../services/dashboardStatsBuilder.service';

/**
 * ⏰ CRON: Rebuild Dashboard Stats a cada 6 horas
 * Schedule: 0 star/6 * * * (00:00, 06:00, 12:00, 18:00)
 */
export function startRebuildDashboardStatsJob() {
  // A cada 6 horas
  cron.schedule('0 */6 * * *', async () => {
    console.log('\n⏰ ========================================');
    console.log('⏰ CRON: Rebuild Dashboard Stats');
    console.log(`⏰ Timestamp: ${new Date().toLocaleString('pt-PT')}`);
    console.log('⏰ ========================================\n');
    
    try {
      await buildDashboardStats();
      console.log('✅ CRON: Dashboard Stats reconstruídos com sucesso!\n');
    } catch (error) {
      console.error('❌ CRON: Erro ao reconstruir Dashboard Stats:', error, '\n');
    }
  });
  
  console.log('✅ CRON Job registado: Rebuild Dashboard Stats (a cada 6h)');
}

/**
 * 🚀 Rebuild manual (após syncs)
 */
export async function rebuildDashboardStatsManual() {
  console.log('\n🔄 ========================================');
  console.log('🔄 MANUAL: Rebuild Dashboard Stats');
  console.log(`🔄 Timestamp: ${new Date().toLocaleString('pt-PT')}`);
  console.log('🔄 ========================================\n');
  
  try {
    // Executar em background (não esperar)
    buildDashboardStats()
      .then(() => console.log('✅ MANUAL: Dashboard Stats reconstruídos!\n'))
      .catch(err => console.error('❌ MANUAL: Erro ao reconstruir:', err, '\n'));
    
  } catch (error) {
    console.error('❌ MANUAL: Erro ao iniciar rebuild:', error, '\n');
  }
}

