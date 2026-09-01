import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { internalError } from '../security/errorHandling'
import {
  getPublishedCarteira,
  getPublishedPortfolioAnalysis,
  getPublishedRadar,
  getPublishedRaiox,
  searchPublishedRaiox,
  getPublishedComparador,
  searchPublishedComparador,
  getPublishedEarnings,
} from '../services/clareza/core/corePublished.runtime'
import { CoreGenerationUnavailableError } from '../services/clareza/core/coreRadarProjection'
import { searchPublishedCarteira } from '../services/clareza/core/coreCarteiraSearch.runtime'
import { CoreRaioxAssetUnavailableError } from '../services/clareza/core/coreRaioxComposition'
import { CoreComparadorRequestError } from '../services/clareza/core/coreComparadorProjection'

interface ClarezaCoreControllerDependencies {
  readonly radar: typeof getPublishedRadar
  readonly carteira: typeof getPublishedCarteira
  readonly portfolioAnalysis: typeof getPublishedPortfolioAnalysis
  readonly search: typeof searchPublishedCarteira
  readonly raiox: typeof getPublishedRaiox
  readonly raioxSearch: typeof searchPublishedRaiox
  readonly comparador: typeof getPublishedComparador
  readonly comparadorSearch: typeof searchPublishedComparador
  readonly earnings: typeof getPublishedEarnings
}

const unavailable = (res: Response) => res.status(503).json({
  error: 'Geração Clareza publicada indisponível.',
})

export function createClarezaCoreController(dependencies: ClarezaCoreControllerDependencies): {
  readonly radar: RequestHandler
  readonly carteira: RequestHandler
  readonly portfolioAnalysis: RequestHandler
  readonly search: RequestHandler
  readonly raiox: RequestHandler
  readonly raioxByTicker: RequestHandler
  readonly comparador: RequestHandler
  readonly earnings: RequestHandler
} {
  return {
    radar: async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.radar()
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        next(internalError('Erro interno do servidor', 'CLAREZA_CORE_RADAR_READ_FAILED', error))
        return
      }
    },

    carteira: async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.carteira()
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        next(internalError('Erro interno do servidor', 'CLAREZA_CARTEIRA_READ_FAILED', error))
        return
      }
    },

    portfolioAnalysis: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.portfolioAnalysis(String(req.query.symbols ?? ''))
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        if (error instanceof RangeError) return res.status(400).json({ error: 'Símbolos inválidos.' })
        next(internalError('Erro interno do servidor', 'CLAREZA_CORE_ANALYSIS_READ_FAILED', error))
        return
      }
    },

    search: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.search(String(req.query.q ?? req.query.search ?? ''))
        res.setHeader('Cache-Control', 'public, max-age=600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof RangeError) return res.status(400).json({ error: 'Pesquisa inválida.' })
        next(internalError('Erro interno do servidor', 'CLAREZA_CORE_SEARCH_READ_FAILED', error))
        return
      }
    },

    raiox: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const search = req.query.search
        if (search !== undefined) {
          const payload = await dependencies.raioxSearch(String(search))
          res.setHeader('Cache-Control', 'public, max-age=600')
          return res.json(payload)
        }
        const rawSymbol = String(req.query.symbol ?? '')
        if (!rawSymbol) return res.status(400).json({ error: 'Parâmetro symbol ou search em falta.' })
        const payload = await dependencies.raiox(rawSymbol)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        if (error instanceof CoreRaioxAssetUnavailableError) {
          return res.status(404).json({ error: 'Ticker nao encontrado' })
        }
        if (error instanceof RangeError) return res.status(400).json({ error: 'Pesquisa ou símbolo inválido.' })
        next(internalError(
          'Erro interno do servidor',
          req.query.search !== undefined ? 'CLAREZA_RAIOX_SEARCH_FAILED' : 'CLAREZA_RAIOX_READ_FAILED',
          error,
        ))
        return
      }
    },

    raioxByTicker: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.raiox(String(req.params.ticker ?? ''))
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        if (error instanceof CoreRaioxAssetUnavailableError) {
          return res.status(404).json({ error: 'Ticker nao encontrado' })
        }
        if (error instanceof RangeError) return res.status(400).json({ error: 'Símbolo inválido.' })
        next(internalError('Erro interno do servidor', 'CLAREZA_RAIOX_READ_FAILED', error))
        return
      }
    },

    comparador: async (req: Request, res: Response, next: NextFunction) => {
      const isSearch = req.query.search !== undefined
      try {
        if (isSearch) {
          const payload = await dependencies.comparadorSearch(String(req.query.search ?? ''))
          res.setHeader('Cache-Control', 'public, max-age=600')
          return res.json(payload)
        }
        if (req.query.symbols === undefined) {
          return res.status(400).json({
            error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.',
          })
        }
        const payload = await dependencies.comparador(String(req.query.symbols ?? ''))
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        if (error instanceof CoreComparadorRequestError || error instanceof RangeError) {
          return res.status(400).json({ error: 'Sem símbolos válidos.' })
        }
        next(internalError(
          'Erro interno do servidor',
          isSearch ? 'CLAREZA_COMPARADOR_SEARCH_FAILED' : 'CLAREZA_COMPARADOR_READ_FAILED',
          error,
        ))
        return
      }
    },

    earnings: async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = await dependencies.earnings()
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.json(payload)
      } catch (error: unknown) {
        if (error instanceof CoreGenerationUnavailableError) return unavailable(res)
        next(internalError('Erro interno do servidor', 'CLAREZA_EARNINGS_READ_FAILED', error))
        return
      }
    },
  }
}

export const clarezaCoreController = createClarezaCoreController({
  radar: getPublishedRadar,
  carteira: getPublishedCarteira,
  portfolioAnalysis: getPublishedPortfolioAnalysis,
  search: searchPublishedCarteira,
  raiox: getPublishedRaiox,
  raioxSearch: searchPublishedRaiox,
  comparador: getPublishedComparador,
  comparadorSearch: searchPublishedComparador,
  earnings: getPublishedEarnings,
})
