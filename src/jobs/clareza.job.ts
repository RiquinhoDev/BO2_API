import { refreshClarezaData } from '../services/clareza/clarezaFmpService'

const clarezaJob = {
  async run(): Promise<{ success: boolean; total: number; errors: number }> {
    console.log('📈 [ClarezaRefresh] Iniciando...')
    const startTime = Date.now()

    try {
      const result = await refreshClarezaData()
      const duration = Math.round((Date.now() - startTime) / 1000)
      console.log(`✅ [ClarezaRefresh] Concluído em ${duration}s — ${result.total} ações`)
      return { success: true, ...result }
    } catch (error: any) {
      console.error('❌ [ClarezaRefresh] Erro:', error.message)
      return { success: false, total: 0, errors: 1 }
    }
  }
}

export default clarezaJob
