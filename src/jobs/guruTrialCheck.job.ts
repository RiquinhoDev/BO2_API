import logger from '../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 src/jobs/guruTrialCheck.job.ts
// Cron job — verificação diária de trials Guru
//
// Fluxo: plano bounded único (sync + expiry) → validar tudo → aplicar efeitos
//
// IMPORTANTE: NÃO inativa no CursEduca. Apenas MARCA PARA_INATIVAR.
// A inativação real continua manual (Gerir Subscrições / Inativação).
// ════════════════════════════════════════════════════════════

import { runGuruTrialCheck } from '../services/guru/guruTrialService'
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
      const result = await runGuruTrialCheck(options)
      logger.info(
        `⏳ [GuruTrialCheck] Check: ${result.markedForInactivation} marcados, ` +
        `${result.converted} convertidos, ${result.stillInTrial} ainda em trial`
      )

      const duration = Math.round((Date.now() - startTime) / 1000)
      logger.info(`✅ [GuruTrialCheck] Concluído em ${duration}s`)

      return {
        success: result.errors === 0,
        total: result.synced + result.checked,
        updated: result.converted,
        errors: result.errors,
        synced: result.synced,
        markedForInactivation: result.markedForInactivation,
        converted: result.converted,
        ...(result.dryRun === true ? { dryRun: true as const, plan: result.plan } : {}),
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
