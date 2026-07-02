import { Request, Response } from 'express'
import { getClarezaData, refreshClarezaData, getReitAnalysis, getReitValuation, getStockAnalysis } from '../services/clareza/clarezaFmpService'
import { getClarezaTop10Json, refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'
import { getRaioxJson, searchRaiox, refreshClarezaRaioxData, diagnoseRaiox } from '../services/clareza/clarezaRaioxService'

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
      const json = await getClarezaTop10Json()
      if (!json) {
        return res.status(503).json({ error: 'Dados indisponíveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('Timing-Allow-Origin', '*') // expõe métricas de timing ao browser cross-origin
      res.type('application/json')
      // Envia a string já serializada (gzip aplicado pelo middleware compression). Sem res.json → sem stringify.
      return res.send(json)
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

  async getReitValuation(req: Request, res: Response) {
    try {
      const data = await getReitValuation(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      const msg = error.message || 'Erro interno do servidor'
      const status = /invalido|nao encontrado/i.test(msg) ? 400 : 500
      if (status === 500) console.error('[GET /api/clareza/reit-valuation/:ticker]', msg)
      return res.status(status).json({ error: msg })
    }
  },

  async getStock(req: Request, res: Response) {
    try {
      const data = await getStockAnalysis(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      const msg = error.message || 'Erro interno do servidor'
      const status = /invalido|nao encontrado/i.test(msg) ? 400 : 500
      if (status === 500) console.error('❌ [GET /api/clareza/stock/:ticker]', msg)
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
  },

  // ── RAIO-X DA AÇÃO POR TICKER (cache-first: Redis → Mongo → FMP) ──
  async getRaiox(req: Request, res: Response) {
    try {
      // String já serializada no Redis → send direto, sem stringify por pedido.
      const json = await getRaioxJson(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.type('application/json')
      return res.send(json)
    } catch (error: any) {
      const msg = error.message || 'Erro interno do servidor'
      const status = /invalido|nao encontrado/i.test(msg) ? 404 : 500
      if (status === 500) console.error('❌ [GET /api/clareza/raiox/:ticker]', msg)
      return res.status(status).json({ error: msg })
    }
  },

  // ── PESQUISA / AUTOCOMPLETE DO RAIO-X (só cache) ──
  async searchRaiox(req: Request, res: Response) {
    try {
      const data = await searchRaiox(String(req.query.q || req.query.search || ''))
      res.setHeader('Cache-Control', 'public, max-age=600')
      return res.json(data)
    } catch (error: any) {
      console.error('❌ [GET /api/clareza/raiox-search]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  // ── DIAGNÓSTICO: testa só os tickers internacionais novos contra a FMP ──
  async diagnoseRaiox(req: Request, res: Response) {
    try {
      const result = await diagnoseRaiox()
      return res.json(result)
    } catch (error: any) {
      console.error('❌ [GET /api/clareza/raiox-diagnose]', error.message)
      return res.status(500).json({ error: error.message })
    }
  },

  async refreshRaiox(req: Request, res: Response) {
    try {
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      console.log('🔄 [POST /api/clareza/raiox/refresh] Refresh manual iniciado')
      const result = await refreshClarezaRaioxData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('❌ [POST /api/clareza/raiox/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  }
}
