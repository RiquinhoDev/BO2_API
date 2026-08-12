import logger from '../utils/logger'
// ════════════════════════════════════════════════════════════
// 🧹 CRON EXECUTION CLEANUP JOB
// ════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// Limpa registos de execuções antigas (>90 dias) para manter BD limpa
// Schedule original: Todos os domingos às 03:00
//
// ════════════════════════════════════════════════════════════

import schedule from 'node-schedule'
import CronExecution from '../models/cron/CronExecution'

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────

const RETENTION_DAYS = 90 // Manter últimos 90 dias
const CRON_SCHEDULE = '0 3 * * 0' // Domingos às 03:00
const MIN_RECORDS_TO_KEEP = 100 // Sempre manter pelo menos 100 registos

logger.info(`⚠️ CronExecutionCleanup: DESATIVADO (migrado para wizard CRON)`)
logger.info(`   Schedule original: ${CRON_SCHEDULE} (Domingos às 03:00)`)
logger.info(`   Retenção: ${RETENTION_DAYS} dias`)
logger.info(`   Mínimo a manter: ${MIN_RECORDS_TO_KEEP} registos`)

// ─────────────────────────────────────────────────────────────
// FUNÇÃO DE LIMPEZA
// ─────────────────────────────────────────────────────────────

async function cleanupOldExecutions(): Promise<{
  success: boolean
  deleted: number
  remaining: number
  error?: string
}> {
  const executionId = `CLEANUP-${Date.now()}`
  
  logger.info(`\n${'═'.repeat(70)}`)
  logger.info(`🧹 INICIANDO LIMPEZA DE HISTÓRICO - ${executionId}`)
  logger.info(`${'═'.repeat(70)}`)

  const startTime = Date.now()

  try {
    // Calcular data limite (90 dias atrás)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    logger.info(`📅 Data limite: ${cutoffDate.toISOString()}`)
    logger.info(`   Registos anteriores a esta data serão removidos`)

    // Contar total de registos
    const totalBefore = await CronExecution.countDocuments()
    logger.info(`📊 Total de registos ANTES: ${totalBefore}`)

    // Contar registos a remover
    const toDelete = await CronExecution.countDocuments({
      startTime: { $lt: cutoffDate }
    })
    logger.info(`🗑️  Registos candidatos à remoção: ${toDelete}`)

    // ✅ PROTEÇÃO: Sempre manter pelo menos MIN_RECORDS_TO_KEEP
    if (totalBefore - toDelete < MIN_RECORDS_TO_KEEP) {
      logger.info(`⚠️  PROTEÇÃO ATIVADA: Manter pelo menos ${MIN_RECORDS_TO_KEEP} registos`)
      logger.info(`   Nenhum registo será removido nesta execução`)
      
      return {
        success: true,
        deleted: 0,
        remaining: totalBefore,
        error: `Proteção ativada: manter mínimo de ${MIN_RECORDS_TO_KEEP} registos`
      }
    }

    // Executar remoção
    const result = await CronExecution.deleteMany({
      startTime: { $lt: cutoffDate }
    })

    // Contar registos restantes
    const totalAfter = await CronExecution.countDocuments()

    const duration = Date.now() - startTime

    logger.info(`\n${'─'.repeat(70)}`)
    logger.info(`✅ LIMPEZA CONCLUÍDA`)
    logger.info(`${'─'.repeat(70)}`)
    logger.info(`🗑️  Registos removidos: ${result.deletedCount}`)
    logger.info(`📊 Registos restantes: ${totalAfter}`)
    logger.info(`💾 Espaço liberado: ~${(result.deletedCount * 0.5).toFixed(2)} KB (estimado)`)
    logger.info(`⏱️  Tempo total: ${(duration / 1000).toFixed(2)}s`)
    logger.info(`${'═'.repeat(70)}\n`)

    return {
      success: true,
      deleted: result.deletedCount,
      remaining: totalAfter
    }

  } catch (error: any) {
    const duration = Date.now() - startTime
    
    logger.error(`\n${'═'.repeat(70)}`)
    logger.error(`❌ ERRO NA LIMPEZA - ${executionId}`)
    logger.error(`${'═'.repeat(70)}`)
    logger.error(`Erro: ${error.message}`)
    logger.error(`Tempo até falha: ${(duration / 1000).toFixed(2)}s`)
    logger.error(`${'═'.repeat(70)}\n`)

    return {
      success: false,
      deleted: 0,
      remaining: await CronExecution.countDocuments(),
      error: error.message
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAR FUNÇÃO PARA EXECUÇÃO MANUAL
// ─────────────────────────────────────────────────────────────

export async function runCleanupManually(dryRun: boolean = false): Promise<
  Awaited<ReturnType<typeof cleanupOldExecutions>> |
  { success: true; dryRun: true; wouldDelete: number; totalBefore: number }
> {
  logger.info(`🧪 Executando limpeza manual${dryRun ? ' (DRY RUN)' : ''}...`)
  
  if (dryRun) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    const totalBefore = await CronExecution.countDocuments()
    const toDelete = await CronExecution.countDocuments({
      startTime: { $lt: cutoffDate }
    })

    logger.info(`📊 Total de registos: ${totalBefore}`)
    logger.info(`🗑️  Registos a remover: ${toDelete}`)
    logger.info(`📅 Data limite: ${cutoffDate.toISOString()}`)
    logger.info(`🔍 DRY RUN - Nenhum registo foi removido`)

    return {
      success: true,
      dryRun: true,
      wouldDelete: toDelete,
      totalBefore
    }
  }

  return await cleanupOldExecutions()
}

export default {
  run: runCleanupManually
}