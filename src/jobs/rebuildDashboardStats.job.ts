// ═══════════════════════════════════════════════════════════════════════════
// ⏰ CRON JOB: Rebuild Dashboard Stats
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// Reconstrói stats do dashboard periodicamente
// Schedule original: Todos os dias às 03:00 + a cada 6 horas
//
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import { buildDashboardStats } from '../services/dashboardStatsBuilder.service';

/**
 * 🚀 Rebuild manual (após syncs)
 * 
 * ✅ CORRIGIDO: Agora usa await e retorna resultado
 */
export async function rebuildDashboardStatsManual() {
  console.log('\n🔄 ========================================');
  console.log('🔄 MANUAL: Rebuild Dashboard Stats');
  console.log(`🔄 Timestamp: ${new Date().toLocaleString('pt-PT')}`);
  console.log('🔄 ========================================\n');
  
  try {
    // ✅ CORRIGIDO: Usar await para esperar conclusão
    await buildDashboardStats()
    
    console.log('✅ MANUAL: Dashboard Stats reconstruídos!\n')
    
    // ✅ CORRIGIDO: Retornar resultado de sucesso
    return {
      success: true,
      message: 'Dashboard Stats reconstruídos com sucesso'
    }
    
  } catch (error: any) {
    console.error('❌ MANUAL: Erro ao reconstruir:', error, '\n');
    
    // ✅ CORRIGIDO: Lançar erro para CRON system capturar
    throw new Error(`Erro ao rebuild dashboard stats: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: rebuildDashboardStatsManual
}