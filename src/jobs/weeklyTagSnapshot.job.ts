// ════════════════════════════════════════════════════════════
// 🏷️ WEEKLY TAG SNAPSHOT JOB
// ════════════════════════════════════════════════════════════
//
// Snapshot semanal de tags nativas da ActiveCampaign
// Schedule: Domingos às 02:00
//
// Funções:
// - Captura tags nativas de todos os alunos (ou todos os contactos AC)
// - Compara com snapshot anterior (semana passada)
// - Detecta mudanças em tags críticas
// - Gera notificações agrupadas por tag
// - Mantém histórico de 6 meses
//
// ════════════════════════════════════════════════════════════

import { weeklyTagMonitoringService } from '../services/tagMonitoring'
import logger from '../utils/logger'

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────

const CRON_SCHEDULE = '0 2 * * 0' // Domingos às 02:00
const JOB_NAME = 'WeeklyTagSnapshot'

logger.info(`📋 ${JOB_NAME}: Configurado`)
logger.info(`   Schedule: ${CRON_SCHEDULE} (Domingos às 02:00)`)
logger.info(`   Timezone: Europe/Lisbon`)

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function executeWeeklySnapshot(): Promise<{
  success: boolean
  total: number
  inserted: number
  updated: number
  errors: number
  skipped: number
  duration?: string
  errorMessage?: string
}> {
  const executionId = `WEEKLY-SNAPSHOT-${Date.now()}`

  logger.info('═══════════════════════════════════════════════════════════')
  logger.info(`🏷️  INICIANDO SNAPSHOT SEMANAL DE TAGS - ${executionId}`)
  logger.info('═══════════════════════════════════════════════════════════')

  const startTime = Date.now()

  try {
    // Executar snapshot semanal via serviço
    const result = await weeklyTagMonitoringService.performWeeklySnapshot()

    const duration = Date.now() - startTime

    logger.info('═══════════════════════════════════════════════════════════')
    logger.info('✅ SNAPSHOT SEMANAL CONCLUÍDO!')
    logger.info('═══════════════════════════════════════════════════════════')
    logger.info(`📊 Modo: ${result.mode}`)
    logger.info(`👥 Total processado: ${result.totalStudents}`)
    logger.info(`📸 Snapshots criados: ${result.snapshotsCreated}`)
    logger.info(`📈 Mudanças detectadas: ${result.changesDetected}`)
    logger.info(`🔔 Notificações criadas: ${result.notificationsCreated}`)
    logger.info(`❌ Erros: ${result.errors}`)
    logger.info(`⏱️  Duração: ${result.duration}`)
    logger.info('═══════════════════════════════════════════════════════════')

    // Retornar no formato esperado pelo CRON system
    return {
      success: result.success,
      total: result.totalStudents,
      inserted: result.snapshotsCreated,
      updated: result.notificationsCreated,
      errors: result.errors,
      skipped: result.totalStudents - result.snapshotsCreated,
      duration: result.duration,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime

    logger.error('═══════════════════════════════════════════════════════════')
    logger.error(`❌ ERRO NO SNAPSHOT SEMANAL - ${executionId}`)
    logger.error('═══════════════════════════════════════════════════════════')
    logger.error(`Erro: ${error.message}`)
    logger.error(`Stack: ${error.stack}`)
    logger.error(`Tempo até falha: ${(duration / 1000).toFixed(2)}s`)
    logger.error('═══════════════════════════════════════════════════════════')

    return {
      success: false,
      total: 0,
      inserted: 0,
      updated: 0,
      errors: 1,
      skipped: 0,
      duration: `${(duration / 1000).toFixed(2)}s`,
      errorMessage: error.message,
    }
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTAR FUNÇÃO PARA EXECUÇÃO MANUAL
// ─────────────────────────────────────────────────────────────

export async function runWeeklySnapshotManually(): Promise<Awaited<ReturnType<typeof executeWeeklySnapshot>>> {
  logger.info('🚀 Executando snapshot semanal manual...')
  return await executeWeeklySnapshot()
}

export default {
  run: runWeeklySnapshotManually,
}
