import { Request, Response } from 'express'
import { getClarezaData, refreshClarezaData, getReitAnalysis, getReitValuation, getStockAnalysis } from '../services/clareza/clarezaFmpService'
import { getClarezaTop10Json, refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'
import { getRaioxJson, searchRaiox, refreshClarezaRaioxData, diagnoseRaiox } from '../services/clareza/clarezaRaioxService'
import { getClarezaCarteiraData, searchCarteira, refreshClarezaCarteiraData } from '../services/clareza/clarezaCarteiraService'
import { getClarezaEarningsData, refreshClarezaEarningsData } from '../services/clareza/clarezaEarningsService'
import {
  getComparadorSymbols,
  searchComparador,
  refreshClarezaComparadorData,
  refreshComparadorSymbols
} from '../services/clareza/clarezaComparadorService'

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

  // ── RAIO-X POR QUERY STRING (compat com o contrato do PHP original:
  //    ?symbol=AAPL ou ?search=apple no mesmo URL) — o HTML de raio-x-acao
  //    em produção já chama assim, não `/raiox/:ticker`.
  async getRaioxByQuery(req: Request, res: Response) {
    try {
      if (req.query.search !== undefined) {
        const data = await searchRaiox(String(req.query.search || ''))
        res.setHeader('Cache-Control', 'public, max-age=600')
        return res.json(data)
      }

      const symbol = String(req.query.symbol || '')
      if (!symbol) {
        return res.status(400).json({ error: 'Parâmetro symbol ou search em falta.' })
      }

      const json = await getRaioxJson(symbol)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.type('application/json')
      return res.send(json)
    } catch (error: any) {
      const msg = error.message || 'Erro interno do servidor'
      const status = /invalido|nao encontrado/i.test(msg) ? 404 : 500
      if (status === 500) console.error('❌ [GET /api/clareza/raiox?symbol=]', msg)
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
  },

  async getCarteira(req: Request, res: Response) {
    try {
      const data = await getClarezaCarteiraData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponiveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      console.error('[GET /api/clareza/carteira/data]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  async searchCarteira(req: Request, res: Response) {
    try {
      const data = await searchCarteira(String(req.query.q || req.query.search || ''))
      res.setHeader('Cache-Control', 'public, max-age=600')
      return res.json(data)
    } catch (error: any) {
      console.error('[GET /api/clareza/carteira-search]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  async getEarnings(req: Request, res: Response) {
    try {
      const data = await getClarezaEarningsData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponiveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: any) {
      console.error('[GET /api/clareza/earnings/data]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  async refreshEarnings(req: Request, res: Response) {
    try {
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      console.log('[POST /api/clareza/earnings/refresh] Refresh manual iniciado')
      const result = await refreshClarezaEarningsData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('[POST /api/clareza/earnings/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  },
  // ── COMPARADOR DE AÇÕES ─────────────────────────────────────
  // Endpoint único, com o mesmo contrato do clareza-comparador.php:
  // ?symbols=AAPL,MSFT compara (máx. 4) e ?search=apple pesquisa.
  // Assim o HTML só troca a constante PHP_URL por este URL.
  async getComparador(req: Request, res: Response) {
    try {
      if (req.query.search !== undefined) {
        const data = await searchComparador(String(req.query.search || ''))
        res.setHeader('Cache-Control', 'public, max-age=600')
        return res.json(data)
      }

      if (req.query.symbols !== undefined) {
        const data = await getComparadorSymbols(String(req.query.symbols || ''))
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.status(data.error ? 400 : 200).json(data)
      }

      return res.status(400).json({
        error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.'
      })
    } catch (error: any) {
      console.error('❌ [GET /api/clareza/comparador]', error.message)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }
  },

  async refreshComparador(req: Request, res: Response) {
    try {
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      // ?symbols=AAPL,MSFT → refresca só esses (máx. 10). Sem symbols → tudo.
      if (req.query.symbols !== undefined) {
        console.log('🔄 [POST /api/clareza/comparador/refresh] Refresh de símbolos específicos')
        const result = await refreshComparadorSymbols(String(req.query.symbols || ''))
        return res.status(result.error ? 400 : 200).json(result)
      }

      console.log('🔄 [POST /api/clareza/comparador/refresh] Refresh completo iniciado')
      const result = await refreshClarezaComparadorData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('❌ [POST /api/clareza/comparador/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  },

  async refreshCarteira(req: Request, res: Response) {
    try {
      const expectedToken = process.env.CLAREZA_REFRESH_TOKEN
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      console.log('[POST /api/clareza/carteira/refresh] Refresh manual iniciado')
      const result = await refreshClarezaCarteiraData()
      return res.json({ success: true, ...result })
    } catch (error: any) {
      console.error('[POST /api/clareza/carteira/refresh]', error.message)
      return res.status(500).json({ error: error.message })
    }
  }
}
