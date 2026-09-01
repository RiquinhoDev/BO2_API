import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { successResponse } from '../contracts/responseContract'
import { internalError } from '../security/errorHandling'
import {
  exportCoreSuggestionsCsv,
  listCoreSuggestions,
} from '../services/clareza/core/coreSuggestionAdmin.runtime'

interface ClarezaSuggestionAdminControllerDependencies {
  readonly list: typeof listCoreSuggestions
  readonly exportCsv: typeof exportCoreSuggestionsCsv
}

function positiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new RangeError('query parameter must be a positive integer')
  }
  return Number(value)
}

export function createClarezaSuggestionAdminController(
  dependencies: ClarezaSuggestionAdminControllerDependencies,
): { readonly list: RequestHandler; readonly exportCsv: RequestHandler } {
  const list: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dependencies.list(
        positiveInteger(req.query.page, 1),
        positiveInteger(req.query.pageSize, 25),
      )
      return res.json(successResponse(result))
    } catch (error: unknown) {
      if (error instanceof RangeError) {
        return res.status(400).json({ error: 'Paginação inválida.' })
      }
      next(internalError(
        'Não foi possível consultar as sugestões.',
        'CLAREZA_SUGGESTION_ADMIN_FAILED',
        error,
      ))
      return
    }
  }

  const exportCsv: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const csv = await dependencies.exportCsv(positiveInteger(req.query.limit, 1000))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="clareza-suggestions.csv"')
      res.write(csv)
      return res.end()
    } catch (error: unknown) {
      if (error instanceof RangeError) {
        return res.status(400).json({ error: 'Limite de exportação inválido.' })
      }
      next(internalError(
        'Não foi possível exportar as sugestões.',
        'CLAREZA_SUGGESTION_ADMIN_FAILED',
        error,
      ))
      return
    }
  }

  return { list, exportCsv }
}

export const clarezaSuggestionAdminController = createClarezaSuggestionAdminController({
  list: listCoreSuggestions,
  exportCsv: exportCoreSuggestionsCsv,
})
