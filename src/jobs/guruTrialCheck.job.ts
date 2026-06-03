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

const guruTrialCheckJob = {
  async run(): Promise<{
    success: boolean
    total: number
    updated: number
    errors: number
    synced: number
    markedForInactivation: number
    converted: number
  }> {
    console.log('⏳ [GuruTrialCheck] Iniciando verificação de trials...')
    const startTime = Date.now()

    try {
      // 1. Sincronizar trials da API Guru (apanha novos + actualiza datas)
      const syncResult = await syncTrialsFromGuru()
      console.log(`⏳ [GuruTrialCheck] Sync: ${syncResult.synced} trials sincronizados`)

      // 2. Verificar expirados → marcar PARA_INATIVAR (NÃO inativa)
      const checkResult = await checkExpiredTrials()
      console.log(
        `⏳ [GuruTrialCheck] Check: ${checkResult.markedForInactivation} marcados, ` +
        `${checkResult.converted} convertidos, ${checkResult.stillInTrial} ainda em trial`
      )

      const duration = Math.round((Date.now() - startTime) / 1000)
      console.log(`✅ [GuruTrialCheck] Concluído em ${duration}s`)

      return {
        success: true,
        total: syncResult.synced + checkResult.checked,
        updated: checkResult.converted,
        errors: syncResult.errors + checkResult.errors,
        synced: syncResult.synced,
        markedForInactivation: checkResult.markedForInactivation,
        converted: checkResult.converted,
      }
    } catch (error: any) {
      console.error('❌ [GuruTrialCheck] Erro:', error.message)
      return {
        success: false,
        total: 0,
        updated: 0,
        errors: 1,
        synced: 0,
        markedForInactivation: 0,
        converted: 0,
      }
    }
  },
}

export default guruTrialCheckJob
