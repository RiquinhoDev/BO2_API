import logger from '../utils/logger'
import { type NextFunction, type Request, type Response } from 'express'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import { isClarezaRefreshAuthorized } from '../security/clarezaRefreshAuthorization'
import { getClarezaData, refreshClarezaData, getReitAnalysis, getReitValuation, getStockAnalysis } from '../services/clareza/clarezaFmpService'
import { getClarezaTop10Json, refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'
import { getRaioxJson, searchRaiox, diagnoseRaiox, readRaioxRefreshStatus, startRaioxRefresh } from '../services/clareza/clarezaRaioxService'
import { getClarezaCarteiraData, searchCarteira, refreshClarezaCarteiraData } from '../services/clareza/carteira/carteira.runtime'
import { getClarezaEarningsData, refreshClarezaEarningsData } from '../services/clareza/clarezaEarningsService'
import { forwardApplicationError } from '../security/forwardApplicationError'
import {
  getComparadorSymbols,
  searchComparador,
  refreshComparadorSymbols,
  refreshClarezaComparadorData,
} from '../services/clareza/comparador/comparador.runtime'
import { ComparadorPolicyError, comparadorPolicyMessage } from '../services/clareza/comparador/comparadorPolicy'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const clarezaController = {
  async getData(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getClarezaData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponíveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_DATA_READ_FAILED', error))
      return
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      logger.info('🔄 [POST /api/clareza/refresh] Refresh manual iniciado')
      const result = await refreshClarezaData()
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_DATA_REFRESH_FAILED')
      return
    }
  },

  // ── TOP 10 AÇÕES DA EQUIPA ──────────────────────────────────
  async getTop10(req: Request, res: Response, next: NextFunction) {
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
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_TOP10_READ_FAILED', error))
      return
    }
  },

  // ── ANÁLISE REIT POR TICKER (live FMP) ──────────────────────
  async getReit(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getReitAnalysis(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      const message = errorMessage(error) || 'Erro interno do servidor'
      if (/invalido|nao encontrado/i.test(message)) {
        return res.status(400).json({ error: message })
      }
      next(internalError('Erro interno do servidor', 'CLAREZA_REIT_READ_FAILED', error))
      return
    }
  },

  async getReitValuation(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getReitValuation(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      const message = errorMessage(error) || 'Erro interno do servidor'
      if (/invalido|nao encontrado/i.test(message)) {
        return res.status(400).json({ error: message })
      }
      next(internalError('Erro interno do servidor', 'CLAREZA_REIT_VALUATION_READ_FAILED', error))
      return
    }
  },

  async getStock(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getStockAnalysis(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      const message = errorMessage(error) || 'Erro interno do servidor'
      if (/invalido|nao encontrado/i.test(message)) {
        return res.status(400).json({ error: message })
      }
      next(internalError('Erro interno do servidor', 'CLAREZA_STOCK_READ_FAILED', error))
      return
    }
  },

  async refreshTop10(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      logger.info('🔄 [POST /api/clareza/top10/refresh] Refresh manual iniciado')
      const result = await refreshClarezaTop10Data()
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_TOP10_REFRESH_FAILED')
      return
    }
  },

  // ── RAIO-X DA AÇÃO POR TICKER (cache-first: Redis → Mongo → FMP) ──
  async getRaiox(req: Request, res: Response, next: NextFunction) {
    try {
      // String já serializada no Redis → send direto, sem stringify por pedido.
      const json = await getRaioxJson(String(req.params.ticker || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.type('application/json')
      return res.send(json)
    } catch (error: unknown) {
      const message = errorMessage(error) || 'Erro interno do servidor'
      if (/invalido|nao encontrado/i.test(message)) {
        return res.status(404).json({ error: message })
      }
      next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_READ_FAILED', error))
      return
    }
  },

  // ── RAIO-X POR QUERY STRING (compat com o contrato do PHP original:
  //    ?symbol=AAPL ou ?search=apple no mesmo URL) — o HTML de raio-x-acao
  //    em produção já chama assim, não `/raiox/:ticker`.
  async getRaioxByQuery(req: Request, res: Response, next: NextFunction) {
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
    } catch (error: unknown) {
      const message = errorMessage(error) || 'Erro interno do servidor'
      if (/invalido|nao encontrado/i.test(message)) {
        return res.status(404).json({ error: message })
      }
      if (req.query.search !== undefined) {
        next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_SEARCH_FAILED', error))
      } else {
        next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_READ_FAILED', error))
      }
      return
    }
  },

  // ── PESQUISA / AUTOCOMPLETE DO RAIO-X (só cache) ──
  async searchRaiox(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await searchRaiox(String(req.query.q || req.query.search || ''))
      res.setHeader('Cache-Control', 'public, max-age=600')
      return res.json(data)
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_SEARCH_FAILED', error))
      return
    }
  },

  // ── DIAGNÓSTICO: testa só os tickers internacionais novos contra a FMP ──
  async diagnoseRaiox(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await diagnoseRaiox()
      return res.json(result)
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_RAIOX_DIAGNOSE_FAILED')
      return
    }
  },

  async refreshRaiox(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      logger.info('🔄 [POST /api/clareza/raiox/refresh] Refresh manual iniciado')
      const result = await startRaioxRefresh()
      return res.status(202).json(successResponse(result))
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_RAIOX_REFRESH_FAILED')
      return
    }
  },

  async getCarteira(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getClarezaCarteiraData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponiveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_CARTEIRA_READ_FAILED', error))
      return
    }
  },

  async searchCarteira(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await searchCarteira(String(req.query.q || req.query.search || ''))
      res.setHeader('Cache-Control', 'public, max-age=600')
      return res.json(data)
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_CARTEIRA_SEARCH_FAILED', error))
      return
    }
  },

  async getEarnings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getClarezaEarningsData()
      if (!data) {
        return res.status(503).json({ error: 'Dados indisponiveis. Tente novamente em breve.' })
      }
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_EARNINGS_READ_FAILED', error))
      return
    }
  },

  async refreshEarnings(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      logger.info('[POST /api/clareza/earnings/refresh] Refresh manual iniciado')
      const result = await refreshClarezaEarningsData()
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_EARNINGS_REFRESH_FAILED')
      return
    }
  },
  async refreshCarteira(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')

      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      logger.info('[POST /api/clareza/carteira/refresh] Refresh manual iniciado')
      const result = await refreshClarezaCarteiraData()
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_CARTEIRA_REFRESH_FAILED')
      return
    }
  },

  async getComparador(req: Request, res: Response, next: NextFunction) {
    const isSearch = req.query.search !== undefined
    try {
      if (isSearch) {
        const data = await searchComparador(String(req.query.search || ''))
        res.setHeader('Cache-Control', 'public, max-age=600')
        return res.json(data)
      }

      if (req.query.symbols === undefined) {
        return res.status(400).json({
          error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.',
        })
      }

      const data = await getComparadorSymbols(String(req.query.symbols || ''))
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      if (error instanceof ComparadorPolicyError) {
        return res.status(400).json({ error: comparadorPolicyMessage(error) })
      }
      forwardApplicationError(
        next,
        error,
        'Erro interno do servidor',
        isSearch ? 'CLAREZA_COMPARADOR_SEARCH_FAILED' : 'CLAREZA_COMPARADOR_READ_FAILED',
      )
      return
    }
  },

  async refreshComparador(req: Request, res: Response, next: NextFunction) {
    try {
      const providedToken = String(req.header('x-clareza-refresh-token') || req.query.token || '')
      if (!isClarezaRefreshAuthorized(providedToken)) {
        return res.status(403).json({ error: 'Refresh Clareza nao autorizado' })
      }

      if (req.query.symbols !== undefined) {
        const result = await refreshComparadorSymbols(String(req.query.symbols || ''))
        return res.json(successResponse(result))
      }

      const result = await refreshClarezaComparadorData()
      return res.json(successResponse(result))
    } catch (error: unknown) {
      if (error instanceof ComparadorPolicyError) {
        return res.status(400).json({ error: comparadorPolicyMessage(error) })
      }
      forwardApplicationError(next, error, 'Erro interno do servidor', 'CLAREZA_COMPARADOR_REFRESH_FAILED')
      return
    }
  },

  async getRaioxRefreshStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(successResponse(await readRaioxRefreshStatus()))
    } catch (error: unknown) {
      next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_REFRESH_STATUS_FAILED', error))
      return
    }
  },
}
