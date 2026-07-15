import type { RequestHandler } from 'express'

export interface DebugRoutesConfiguration {
  enableDebugRoutes: boolean
}

let enabled = false

export function configureDebugRoutes(configuration: DebugRoutesConfiguration): void {
  enabled = configuration.enableDebugRoutes
}

export function guruTokenDebugStatus(token: string | undefined) {
  return {
    success: true,
    debug: { configured: Boolean(token) },
  }
}

export const localDebugOnly: RequestHandler = (_req, res, next) => {
  if (!enabled) return res.sendStatus(404)
  next()
}
