import { Request, Response } from 'express'
import { getClarezaData, refreshClarezaData, getReitAnalysis } from '../services/clareza/clarezaFmpService'
import { getClarezaTop10Data, refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'

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
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      console.log('🔄 [POST /api/clareza/refresh] Refresh manual iniciado')
      const result = await refreshClarezaData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('❌ [POST /api/clareza/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  },

  // ── TOP 10 AÇÕES DA EQUIPA ──────────────────────────────────
  async getTop10(req: Request, res: Response) {
    try {
      const data = await getClarezaTop10Data()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponíveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      console.error('❌ [GET /api/clareza/top10]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  // ── ANÁLISE REIT POR TICKER (live FMP) ──────────────────────
  async getReit(req: Request, res: Response) {
    try {
      const data = await getReitAnalysis(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      const msg = error.message || 'Erro interno do servidor'
      const status = /invalido|nao encontrado/i.test(msg) ? 400 : 500
      if (status === 500) console.error('❌ [GET /api/clareza/reit/:ticker]', msg)
      return res.status(status).json({ error: msg })
    }
  },

  async refreshTop10(req: Request, res: Response) {
    try {
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      console.log('🔄 [POST /api/clareza/top10/refresh] Refresh manual iniciado')
      const result = await refreshClarezaTop10Data()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('❌ [POST /api/clareza/top10/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  }
}
