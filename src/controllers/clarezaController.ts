import logger from '../utils/logger'
import { type NextFunction, type Request, type Response } from 'express'
import { HttpError, internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import { isClarezaRefreshAuthorized } from '../security/clarezaRefreshAuthorization'
import { getClarezaData, refreshClarezaData, getReitAnalysis, getReitValuation, getStockAnalysis } from '../services/clareza/clarezaFmpService'
import { getClarezaTop10Json, refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'
import { getRaioxJson, searchRaiox, refreshClarezaRaioxData, diagnoseRaiox } from '../services/clareza/clarezaRaioxService'
import { getClarezaCarteiraData, searchCarteira, refreshClarezaCarteiraData } from '../services/clareza/carteira/carteira.runtime'
import { getClarezaEarningsData, refreshClarezaEarningsData } from '../services/clareza/clarezaEarningsService'
import { forwardApplicationError } from '../security/forwardApplicationError'
import { requestIdFrom } from '../services/activeCampaign/activeCampaignExecution.service'
import {
  runClarezaRefreshWithReceipt,
  type ClarezaRefreshPhaseHooks,
} from '../services/clareza/clarezaRefreshExecution.service'
import type { ClarezaRefreshExecutionOperation } from '../models/ClarezaRefreshExecutionReceipt'
import {
  getComparadorSymbols,
  searchComparador,
  refreshComparadorSymbols,
  refreshClarezaComparadorData,
} from '../services/clareza/comparador/comparador.runtime'
import {
  ComparadorPolicyError,
  comparadorPolicyMessage,
  parseComparadorSymbols,
} from '../services/clareza/comparador/comparadorPolicy'
import { MAX_MANUAL_REFRESH_SYMBOLS } from '../services/clareza/comparador/comparador.service'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runClarezaRefresh<T>(
  req: Request,
  res: Response,
  options: {
    operation: ClarezaRefreshExecutionOperation
    identity: string
    fingerprint: string
    refresh: (hooks: ClarezaRefreshPhaseHooks) => Promise<T>
  },
): Promise<T> {
  return runClarezaRefreshWithReceipt({
    ...options,
    requestId: requestIdFrom(req.get('x-request-id') || res.locals.correlationId),
  })
}

function forwardClarezaRefreshError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof HttpError) {
    next(error)
    return
  }
  forwardApplicationError(next, error, publicMessage, code)
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
      const result = await runClarezaRefresh(req, res, {
        operation: 'market',
        identity: 'market-data',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaData(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_DATA_REFRESH_FAILED')
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
      const result = await runClarezaRefresh(req, res, {
        operation: 'top10',
        identity: 'top10-data',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaTop10Data(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_TOP10_REFRESH_FAILED')
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
      next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_DIAGNOSE_FAILED', error))
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
      const result = await runClarezaRefresh(req, res, {
        operation: 'raiox',
        identity: 'raiox-data',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaRaioxData(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_RAIOX_REFRESH_FAILED')
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
      const result = await runClarezaRefresh(req, res, {
        operation: 'earnings',
        identity: 'earnings-data',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaEarningsData(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_EARNINGS_REFRESH_FAILED')
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
      const result = await runClarezaRefresh(req, res, {
        operation: 'carteira',
        identity: 'carteira-data',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaCarteiraData(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_CARTEIRA_REFRESH_FAILED')
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
        const symbols = parseComparadorSymbols(String(req.query.symbols || ''), MAX_MANUAL_REFRESH_SYMBOLS)
        const normalizedSymbols = symbols.join(',')
        const result = await runClarezaRefresh(req, res, {
          operation: 'comparador',
          identity: 'comparador-symbols',
          fingerprint: normalizedSymbols,
          refresh: hooks => refreshComparadorSymbols(normalizedSymbols, hooks),
        })
        return res.json(successResponse(result))
      }

      const result = await runClarezaRefresh(req, res, {
        operation: 'comparador',
        identity: 'comparador-full',
        fingerprint: 'full',
        refresh: hooks => refreshClarezaComparadorData(hooks),
      })
      return res.json(successResponse(result))
    } catch (error: unknown) {
      if (error instanceof ComparadorPolicyError) {
        return res.status(400).json({ error: comparadorPolicyMessage(error) })
      }
      forwardClarezaRefreshError(next, error, 'Erro interno do servidor', 'CLAREZA_COMPARADOR_REFRESH_FAILED')
      return
    }
  }
}
