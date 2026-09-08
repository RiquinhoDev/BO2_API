import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type clarezaJob from '../jobs/clareza.job'
import { successResponse } from '../contracts/responseContract'
import { HttpError, internalError } from '../security/errorHandling'
import { IntegrationUnavailableError } from '../errors/integrationUnavailableError'
import { executeCanonicalOperation, type CanonicalOperationExecutor } from '../services/clareza/canonicalOperationsExecution'
import { runCoreAliasMaintenance } from '../services/clareza/core/coreAlias.runtime'
import { backfillPublishedCoreCompanions } from '../services/clareza/core/coreCompanionBackfill.runtime'
import { CoreGenerationUnavailableError } from '../services/clareza/core/coreRadarProjection'

interface ClarezaOperationsDependencies {
  readonly execute?: CanonicalOperationExecutor
  readonly refresh: typeof clarezaJob.run
  readonly aliases: typeof runCoreAliasMaintenance
  readonly companions: typeof backfillPublishedCoreCompanions
}

function aliasInput(body: unknown): { readonly limit: number; readonly tickers?: readonly string[] } {
  const value = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  const limit = value.limit ?? 40
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 40) {
    throw new RangeError('alias limit must be between 1 and 40')
  }
  if (value.tickers === undefined) return { limit: Number(limit) }
  if (!Array.isArray(value.tickers) || value.tickers.length > 40 || value.tickers.some(
    ticker => typeof ticker !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,24}$/.test(ticker),
  )) {
    throw new RangeError('alias tickers are invalid')
  }
  return { limit: Number(limit), tickers: value.tickers.map(ticker => ticker.toUpperCase()) }
}

export function createClarezaOperationsController(
  dependencies: ClarezaOperationsDependencies,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const perform = (operation: string, input: unknown, run: () => Promise<object>) =>
        dependencies.execute ? dependencies.execute(req, res, operation, input, run) : run()
      if (req.body?.operation === 'refresh') {
        const result = await perform('refresh', {}, dependencies.refresh)
        return res.json(successResponse({ operation: 'refresh', ...result }))
      }
      if (req.body?.operation === 'aliases') {
        const input = aliasInput(req.body)
        const result = await perform('aliases', input, () => dependencies.aliases(input))
        return res.json(successResponse({ operation: 'aliases', ...result }))
      }
      if (req.body?.operation === 'companions') {
        const result = await perform('companions', {}, dependencies.companions)
        return res.json(successResponse({ operation: 'companions', ...result }))
      }
      return res.status(400).json({ error: 'Operação Clareza inválida.' })
    } catch (error: unknown) {
      if (error instanceof HttpError || error instanceof IntegrationUnavailableError) return next(error)
      if (error instanceof RangeError) {
        return res.status(400).json({ error: 'Parâmetros da operação inválidos.' })
      }
      if (error instanceof CoreGenerationUnavailableError) {
        return res.status(503).json({ error: 'Geração Clareza publicada indisponível.' })
      }
      next(internalError(
        'Não foi possível executar a operação Clareza.',
        'CLAREZA_OPERATION_FAILED',
        error,
      ))
      return
    }
  }
}

export const clarezaOperationsController = createClarezaOperationsController({
  execute: executeCanonicalOperation,
  refresh: async () => (await import('../jobs/clarezaCanonical.job')).default.run(),
  aliases: runCoreAliasMaintenance,
  companions: backfillPublishedCoreCompanions,
})
