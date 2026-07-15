import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import routeCatalog from './route-catalog.json'

type CatalogAccess = 'public' | 'authenticated' | 'signature' | 'dead'
type CatalogRoute = { method: string; path: string; access: CatalogAccess }

const catalog = routeCatalog as CatalogRoute[]
const jwtBypass = new Set(
  catalog
    .filter((route) => route.access === 'public' || route.access === 'signature')
    .map((route) => routeKey(route.method, route.path)),
)
const guardedRoots = new Set(catalog.map((route) => firstPathSegment(route.path)))

export interface DefaultDenyAuthOptions {
  enabled?: boolean
  authenticateRequest?: RequestHandler
}

function normalizePath(value: string): string {
  const normalized = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
  return normalized.toLowerCase()
}

function firstPathSegment(value: string): string {
  return normalizePath(value).split('/')[1] || ''
}

function routeKey(method: string, routePath: string): string {
  return [method.toUpperCase(), normalizePath(routePath)].join(' ')
}

function belongsToGuardedSurface(req: Request): boolean {
  return guardedRoots.has(firstPathSegment(req.path))
}

export function createDefaultDenyAuth(
  options: DefaultDenyAuthOptions = {},
): RequestHandler {
  const enabled = options.enabled ?? true
  const authenticateRequest = options.authenticateRequest ?? authenticate

  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled || !belongsToGuardedSurface(req)) return next()
    if (jwtBypass.has(routeKey(req.method, req.path))) return next()
    return authenticateRequest(req, res, next)
  }
}
