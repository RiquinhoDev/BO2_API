import logger from '../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 src/jobs/guruTrialCheck.job.ts
// Cron job — verificação diária de trials Guru
//
// Fluxo:
//   1. syncTrialsFromGuru() → buscar/actualizar trials da API Guru
//   2. checkExpiredTrials() → marcar PARA_INATIVAR os expirados sem conversão
//
// IMPORTANTE: NÃO inativa no CursEduca. Apenas MARCA PARA_INATIVAR.
// A inativação real continua manual (Gerir Subscrições / Inativação).
// ════════════════════════════════════════════════════════════

import { syncTrialsFromGuru, checkExpiredTrials } from '../services/guru/guruTrialService'
import type { GuruTrialRunOptions } from '../services/guru/guruTrial.types'

const guruTrialCheckJob = {
  async run(options: GuruTrialRunOptions = {}): Promise<{
    success: boolean
    total: number
    updated: number
    errors: number
    synced: number
    markedForInactivation: number
    converted: number
    dryRun?: true
    plan?: unknown
    error?: string
  }> {
    logger.info('⏳ [GuruTrialCheck] Iniciando verificação de trials...')
    const startTime = Date.now()

    try {
      // 1. Sincronizar trials da API Guru (apanha novos + actualiza datas)
      const syncResult = await syncTrialsFromGuru(options)
      logger.info(`⏳ [GuruTrialCheck] Sync: ${syncResult.synced} trials sincronizados`)

      // 2. Verificar expirados → marcar PARA_INATIVAR (NÃO inativa)
      const checkResult = await checkExpiredTrials(options)
      logger.info(
        `⏳ [GuruTrialCheck] Check: ${checkResult.markedForInactivation} marcados, ` +
        `${checkResult.converted} convertidos, ${checkResult.stillInTrial} ainda em trial`
      )

      const duration = Math.round((Date.now() - startTime) / 1000)
      logger.info(`✅ [GuruTrialCheck] Concluído em ${duration}s`)

      return {
        success: syncResult.errors === 0 && checkResult.errors === 0,
        total: syncResult.synced + checkResult.checked,
        updated: checkResult.converted,
        errors: syncResult.errors + checkResult.errors,
        synced: syncResult.synced,
        markedForInactivation: checkResult.markedForInactivation,
        converted: checkResult.converted,
        ...(options.dryRun === true
          ? {
              dryRun: true as const,
              plan: checkResult.plan
                ? { ...checkResult.plan, synced: syncResult.synced }
                : undefined,
            }
          : {}),
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      logger.error('❌ [GuruTrialCheck] Erro:', message)
      return {
        success: false,
        total: 0,
        updated: 0,
        errors: 1,
        synced: 0,
        markedForInactivation: 0,
        converted: 0,
        error: 'Execução Guru TrialCheck falhou',
        ...(options.dryRun === true ? { dryRun: true as const } : {}),
      }
    }
  },
}

export default guruTrialCheckJob
