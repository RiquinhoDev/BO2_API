import { refreshClarezaData } from '../services/clareza/clarezaFmpService'
import { refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'

const clarezaJob = {
  async run(): Promise<{ success: boolean; total: number; errors: number }> {
    console.log('📈 [ClarezaRefresh] Iniciando...')
    const startTime = Date.now()

    try {
      const result = await refreshClarezaData()
      const duration = Math.round((Date.now() - startTime) / 1000)
      console.log(`✅ [ClarezaRefresh] Concluído em ${duration}s — ${result.total} ações`)

      // Top 10 da equipa — mesmo agendamento. Best-effort: não falha o job principal.
      try {
        const top10 = await refreshClarezaTop10Data()
        console.log(`✅ [ClarezaRefresh] Top10 atualizado — ${top10.total} ações, ${top10.errors} erros`)
      } catch (top10Err: any) {
        console.error('⚠️ [ClarezaRefresh] Falha ao atualizar Top10:', top10Err.message)
      }

      return { success: true, ...result }
    } catch (error: any) {
      console.error('❌ [ClarezaRefresh] Erro:', error.message)
      return { success: false, total: 0, errors: 1 }
    }
  }
}

export default clarezaJob
