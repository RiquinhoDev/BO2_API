import { Request, Response } from 'express'
import { getClarezaData, refreshClarezaData } from '../services/clareza/clarezaFmpService'

export const clarezaController = {
  async getData(req: Request, res: Response) {
    try {
      const data = await getClarezaData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponíveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      console.error('❌ [GET /api/clareza/data]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  async refresh(req: Request, res: Response) {
    try {
      console.log('🔄 [POST /api/clareza/refresh] Refresh manual iniciado')
      const result = await refreshClarezaData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('❌ [POST /api/clareza/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  }
}
