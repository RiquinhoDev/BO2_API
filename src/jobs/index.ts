// ════════════════════════════════════════════════════════════
// 📁 src/jobs/index.ts
// Inicializador de todos os CRON jobs
// ════════════════════════════════════════════════════════════
//
// ⚠️ JOBS HARDCODED DESATIVADOS
// Todos os jobs foram migrados para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// ════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import evaluateRulesJob from './evaluateRules.job'
import resetCountersJob from './resetCounters.job'
import dailyPipelineJob from './dailyPipeline.job'

// ─────────────────────────────────────────────────────────────
// INICIALIZAR TODOS OS JOBS
// ─────────────────────────────────────────────────────────────

export function startAllJobs() {
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('🚀 CRON JOBS - Sistema Unificado (Wizard)')
  logger.info('═══════════════════════════════════════════════════════')

  try {
    // ❌ TODOS OS JOBS HARDCODED FORAM DESATIVADOS
    // Jobs agora são geridos via wizard em: http://localhost:3000/activecampaign
    
    // 1. Pipeline diário (02:00 - todos os dias)
    // dailyPipelineJob.schedule() // ❌ DESATIVADO: Migrado para wizard
    
    // 2. Job de avaliação de regras (diário às 2h)
    // evaluateRulesJob - já desativado no próprio ficheiro
    
    // 3. Job de reset de contadores (segunda às 1h)
    // resetCountersJob.start() // ❌ DESATIVADO: Migrado para wizard

    logger.info('═══════════════════════════════════════════════════════')
    logger.info('✅ SISTEMA CRON UNIFICADO ATIVO')
    logger.info('═══════════════════════════════════════════════════════')
    logger.info('')
    logger.info('📋 Gestão de Jobs:')
    logger.info('  🌐 Frontend: http://localhost:3000/activecampaign')
    logger.info('  📊 Dashboard: Ver execuções e histórico')
    logger.info('  ⚙️  Configurar: Criar/editar/desativar jobs')
    logger.info('')
    logger.info('⚡ Execução Manual (via API):')
    logger.info('  - POST /api/sync/execute-pipeline (pipeline completo)')
    logger.info('  - POST /api/activecampaign/test-cron (avalia regras)')
    logger.info('  - POST /api/tag-rules/execute (avalia 1 curso)')
    logger.info('')
    logger.info('✅ Todos os jobs agora controlados via wizard!')
    logger.info('═══════════════════════════════════════════════════════')

  } catch (error: any) {
    logger.error('❌ Erro ao inicializar sistema de jobs:', {
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAR JOBS INDIVIDUAIS (para execução manual)
// ─────────────────────────────────────────────────────────────

export const jobs = {
  dailyPipeline: dailyPipelineJob,
  evaluateRules: evaluateRulesJob,
  resetCounters: resetCountersJob
}

// ─────────────────────────────────────────────────────────────
// EXPORT DEFAULT
// ─────────────────────────────────────────────────────────────

export default {
  startAll: startAllJobs,
  jobs
}