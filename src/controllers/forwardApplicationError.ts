import type { NextFunction } from 'express'
import { IntegrationUnavailableError } from '../errors/integrationUnavailableError'
import { internalError } from '../security/errorHandling'

export function forwardApplicationError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}
