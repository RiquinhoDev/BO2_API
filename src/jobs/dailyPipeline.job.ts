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
// SCHEDULE: Diário às 02:00 (Europe/Lisbon)
//
// ════════════════════════════════════════════════════════════

import cron from 'node-cron'
import logger from '../utils/logger'
import { executeDailyPipeline } from '../services/syncUtilziadoresServices/dailyPipeline.service'

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
// CRON SCHEDULE
// ═══════════════════════════════════════════════════════════

/**
 * Agendar pipeline para execução diária
 * Schedule: Todos os dias às 02:00 (Europe/Lisbon)
 */
export function scheduleDailyPipeline() {
  cron.schedule('0 2 * * *', async () => {
    logger.info('\n' + '═'.repeat(60))
    logger.info('⏰ CRON: Daily Pipeline iniciado')
    logger.info(`📅 Timestamp: ${new Date().toLocaleString('pt-PT')}`)
    logger.info('═'.repeat(60))

    try {
      const result = await executeDailyPipeline()

      if (result.success) {
        logger.info('═'.repeat(60))
        logger.info('✅ CRON: Pipeline completo com sucesso!')
        logger.info('═'.repeat(60))
        logger.info('📊 Resumo:', {
          duration: `${result.duration}s (${Math.floor(result.duration / 60)}min)`,
          steps: {
            hotmart: `${result.steps.syncHotmart.duration}s - ${result.steps.syncHotmart.stats.total} users`,
            curseduca: `${result.steps.syncCursEduca.duration}s - ${result.steps.syncCursEduca.stats.total} users`,
            engagement: `${result.steps.recalcEngagement.duration}s - ${result.steps.recalcEngagement.stats.updated} updated`,
            tagRules: `${result.steps.evaluateTagRules.duration}s - ${result.steps.evaluateTagRules.stats.tagsApplied} tags`
          },
          summary: result.summary
        })
        logger.info('═'.repeat(60))

        // TODO: Enviar notificação de sucesso (email/slack)
        // await notificationService.sendSuccess(result)

      } else {
        logger.warn('═'.repeat(60))
        logger.warn('⚠️ CRON: Pipeline completo COM ERROS')
        logger.warn('═'.repeat(60))
        logger.warn('📊 Resumo:', {
          duration: `${result.duration}s`,
          errors: result.errors,
          steps: {
            hotmart: result.steps.syncHotmart.error ? `❌ ${result.steps.syncHotmart.error}` : '✅',
            curseduca: result.steps.syncCursEduca.error ? `❌ ${result.steps.syncCursEduca.error}` : '✅',
            engagement: result.steps.recalcEngagement.error ? `❌ ${result.steps.recalcEngagement.error}` : '✅',
            tagRules: result.steps.evaluateTagRules.error ? `❌ ${result.steps.evaluateTagRules.error}` : '✅'
          },
          summary: result.summary
        })
        logger.warn('═'.repeat(60))

        // TODO: Enviar alerta de erro (email/slack)
        // await notificationService.sendError(result)
      }

    } catch (error: any) {
      logger.error('═'.repeat(60))
      logger.error('❌ CRON: Pipeline falhou completamente')
      logger.error('═'.repeat(60))
      logger.error('Erro:', {
        message: error.message,
        stack: error.stack
      })
      logger.error('═'.repeat(60))

      // TODO: Enviar alerta CRÍTICO (email/slack)
      // await notificationService.sendCriticalError(error)
    }
  }, {
    timezone: 'Europe/Lisbon'
  })

  logger.info('✅ CRON Job agendado: Daily Pipeline (02:00 Europe/Lisbon)')
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: runDailyPipeline,
  schedule: scheduleDailyPipeline
}