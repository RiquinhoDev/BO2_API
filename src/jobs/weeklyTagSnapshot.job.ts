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
import {
  type WeeklyTagSnapshotOptions,
  type SnapshotResult,
} from '../services/tagMonitoring/weeklyTagMonitoring.service'
import { HttpError } from '../security/errorHandling'
import logger from '../utils/logger'

const CRON_SCHEDULE = '0 2 * * 0'
const JOB_NAME = 'WeeklyTagSnapshot'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : 'N/A'
}

logger.info(`📋 ${JOB_NAME}: Configurado`)
logger.info(`   Schedule: ${CRON_SCHEDULE} (Domingos às 02:00)`)
logger.info(`   Timezone: Europe/Lisbon`)

async function executeWeeklySnapshot(options: WeeklyTagSnapshotOptions = {}): Promise<{
  success: boolean
  total: number
  inserted: number
  updated: number
  errors: number
  skipped: number
  duration?: string
  errorMessage?: string
  dryRun?: true
  plan?: unknown
  data?: SnapshotResult
}> {
  const executionId = `WEEKLY-SNAPSHOT-${Date.now()}`

  logger.info('═══════════════════════════════════════════════════════════')
  logger.info(`🏷️  INICIANDO SNAPSHOT SEMANAL DE TAGS - ${executionId}`)
  logger.info('═══════════════════════════════════════════════════════════')

  const startTime = Date.now()

  try {
    const result = await weeklyTagMonitoringService.performWeeklySnapshot(options)
    const duration = Date.now() - startTime

    logger.info('═══════════════════════════════════════════════════════════')
    logger.info('✅ SNAPSHOT SEMANAL CONCLUÍDO!')
    logger.info('═══════════════════════════════════════════════════════════')
    logger.info(`📊 Modo: ${result.mode}`)
    logger.info(`👥 Total processado: ${result.totalStudents}`)
    const inserted = result.inserted ?? result.snapshotsCreated
    const updated = result.updated ?? 0
    const skipped = result.skipped ?? Math.max(0, result.totalStudents - inserted - updated)
    logger.info(`📸 Snapshots inseridos: ${inserted}`)
    logger.info(`📸 Snapshots atualizados: ${updated}`)
    logger.info(`📈 Mudanças detectadas: ${result.changesDetected}`)
    logger.info(`🔔 Notificações criadas: ${result.notificationsCreated}`)
    logger.info(`❌ Erros: ${result.errors}`)
    logger.info(`⏱️  Duração: ${result.duration}`)
    logger.info('═══════════════════════════════════════════════════════════')

    return {
      success: result.success,
      total: result.totalStudents,
      inserted,
      updated,
      errors: result.errors,
      skipped,
      duration: result.duration,
      data: result,
      ...(result.dryRun === true ? { dryRun: true, plan: result.plan } : {}),
    }
  } catch (error: unknown) {
    if (error instanceof HttpError && error.status === 413
      || (error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError')) {
      throw error
    }
    const duration = Date.now() - startTime
    const message = errorMessage(error)

    logger.error('═══════════════════════════════════════════════════════════')
    logger.error(`❌ ERRO NO SNAPSHOT SEMANAL - ${executionId}`)
    logger.error('═══════════════════════════════════════════════════════════')
    logger.error(`Erro: ${message}`)
    logger.error(`Stack: ${errorStack(error)}`)
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
      errorMessage: message,
    }
  }
}

export async function runWeeklySnapshotManually(options: WeeklyTagSnapshotOptions = {}): Promise<Awaited<ReturnType<typeof executeWeeklySnapshot>>> {
  logger.info('🚀 Executando snapshot semanal manual...')
  return await executeWeeklySnapshot(options)
}

export default {
  run: (options?: WeeklyTagSnapshotOptions) => executeWeeklySnapshot(options),
}
