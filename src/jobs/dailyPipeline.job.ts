// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline.job.ts
// CRON JOB: Daily Pipeline Orchestrator
// ════════════════════════════════════════════════════════════
//
// Executa pipeline diário completo (4 steps sequenciais):
// 1. Sync Hotmart → Colhe dados OGI
// 2. Sync CursEduca → Colhe dados CLAREZA
// 3. Recalc Engagement → Processa metrics com dados frescos
// 4. Tag Rules → Aplica tags com dados completos
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import logger from '../utils/logger'
import { executeDailyPipeline } from '../services/cron/dailyPipeline.service'

// ═══════════════════════════════════════════════════════════
// EXECUTAR PIPELINE MANUALMENTE
// ═══════════════════════════════════════════════════════════

/**
 * Executar pipeline manualmente (via API ou scripts)
 */
export async function runDailyPipeline() {
  logger.info('═'.repeat(60))
  logger.info('🚀 MANUAL: Daily Pipeline iniciado')
  logger.info(`📅 Timestamp: ${new Date().toLocaleString('pt-PT')}`)
  logger.info('═'.repeat(60))

  try {
    const result = await executeDailyPipeline()

    if (result.success) {
      logger.info('═'.repeat(60))
      logger.info('✅ MANUAL: Pipeline completo com sucesso!')
      logger.info('═'.repeat(60))
      logger.info('📊 Resumo:', {
        duration: `${result.duration}s (${Math.floor(result.duration / 60)}min)`,
        steps: {
          hotmart: `${result.steps.syncHotmart.duration}s`,
          curseduca: `${result.steps.syncCursEduca.duration}s`,
          engagement: `${result.steps.recalcEngagement.duration}s`,
          tagRules: `${result.steps.evaluateTagRules.duration}s`
        },
        summary: result.summary
      })
      logger.info('═'.repeat(60))
    } else {
      logger.warn('═'.repeat(60))
      logger.warn('⚠️ MANUAL: Pipeline completo COM ERROS')
      logger.warn('═'.repeat(60))
      logger.warn('📊 Resumo:', {
        duration: `${result.duration}s`,
        errors: result.errors,
        summary: result.summary
      })
      logger.warn('═'.repeat(60))
    }

    return result

  } catch (error: any) {
    logger.error('═'.repeat(60))
    logger.error('❌ MANUAL: Pipeline falhou completamente')
    logger.error('═'.repeat(60))
    logger.error('Erro:', {
      message: error.message,
      stack: error.stack
    })
    logger.error('═'.repeat(60))

    throw error
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: runDailyPipeline
  // schedule: scheduleDailyPipeline // ❌ DESATIVADO: Migrado para wizard
}