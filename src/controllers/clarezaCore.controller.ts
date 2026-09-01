import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { internalError } from '../security/errorHandling'
import {
  getPublishedCarteira,
  getPublishedPortfolioAnalysis,
  getPublishedRadar,
} from '../services/clareza/core/corePublished.runtime'
import { CoreGenerationUnavailableError } from '../services/clareza/core/coreRadarProjection'

interface ClarezaCoreControllerDependencies {
  readonly radar: typeof getPublishedRadar
  readonly carteira: typeof getPublishedCarteira
  readonly portfolioAnalysis: typeof getPublishedPortfolioAnalysis
}

const unavailable = (res: Response) => res.status(503).json({
  error: 'Geração Clareza publicada indisponível.',
})

export function createClarezaCoreController(dependencies: ClarezaCoreControllerDependencies): {
  readonly radar: RequestHandler
  readonly carteira: RequestHandler
  readonly portfolioAnalysis: RequestHandler
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
        next(internalError('Erro interno do servidor', 'CLAREZA_CORE_CARTEIRA_READ_FAILED', error))
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
  }
}

export const clarezaCoreController = createClarezaCoreController({
  radar: getPublishedRadar,
  carteira: getPublishedCarteira,
  portfolioAnalysis: getPublishedPortfolioAnalysis,
})
