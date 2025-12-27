// ════════════════════════════════════════════════════════════
// 📁 src/jobs/index.ts
// Inicializador de todos os CRON jobs
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
  logger.info('🚀 INICIALIZANDO CRON JOBS - Active Campaign')
  logger.info('═══════════════════════════════════════════════════════')

  try {
    // 1. Pipeline diário (02:00 - todos os dias)
    dailyPipelineJob.schedule()
    
    // 2. Job de avaliação de regras (diário às 2h) - Auto-inicia no import
    // evaluateRulesJob já está ativo (usa cron.schedule no próprio arquivo)
    
    // 3. Job de reset de contadores (segunda às 1h)
    resetCountersJob.start()

    logger.info('═══════════════════════════════════════════════════════')
    logger.info('✅ TODOS OS JOBS AGENDADOS COM SUCESSO')
    logger.info('═══════════════════════════════════════════════════════')
    logger.info('')
    logger.info('📋 Jobs ativos:')
    logger.info('  1️⃣  DailyPipeline   → 2h da manhã (todos os dias) ✅')
    logger.info('  2️⃣  EvaluateRules   → 2h da manhã (todos os dias) ✅')
    logger.info('  3️⃣  ResetCounters   → 1h da manhã (segunda-feira) ✅')
    logger.info('')
    logger.info('⚡ Para executar manualmente:')
    logger.info('  - POST /api/sync/execute-pipeline (pipeline completo)')
    logger.info('  - POST /api/activecampaign/test-cron (avalia todas as regras)')
    logger.info('  - POST /api/tag-rules/execute (avalia 1 curso)')
    logger.info('═══════════════════════════════════════════════════════')

  } catch (error: any) {
    logger.error('❌ Erro ao inicializar jobs:', {
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