import logger from '../utils/logger'
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

import { buildDashboardStats } from '../services/dashboardStatsBuilder.service';

class DashboardStatsRebuildError extends Error {
  readonly cause!: Error | undefined

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'DashboardStatsRebuildError'
    Object.defineProperty(this, 'cause', {
      value: cause,
      enumerable: false,
      configurable: true,
    })
  }
}

/**
 * 🚀 Rebuild manual (após syncs)
 * 
 * ✅ CORRIGIDO: Agora usa await e retorna resultado
 */
export async function rebuildDashboardStatsManual() {
  logger.info('\n🔄 ========================================');
  logger.info('🔄 MANUAL: Rebuild Dashboard Stats');
  logger.info(`🔄 Timestamp: ${new Date().toLocaleString('pt-PT')}`);
  logger.info('🔄 ========================================\n');
  
  try {
    // ✅ CORRIGIDO: Usar await para esperar conclusão
    await buildDashboardStats()
    
    logger.info('✅ MANUAL: Dashboard Stats reconstruídos!\n')
    
    // ✅ CORRIGIDO: Retornar resultado de sucesso
    return {
      success: true,
      message: 'Dashboard Stats reconstruídos com sucesso'
    }
    
  } catch (error: unknown) {
    const cause = error instanceof Error ? error : undefined
    const message = cause?.message ?? 'Erro desconhecido'
    logger.error('❌ MANUAL: Erro ao reconstruir:', message, '\n');
    
    // ✅ CORRIGIDO: Lançar erro para CRON system capturar
    throw new DashboardStatsRebuildError(
      `Erro ao rebuild dashboard stats: ${message}`,
      cause,
    )
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: rebuildDashboardStatsManual
}
