import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { matchCatalogRoute, type CatalogRouteMatch } from './routeCatalogMatcher'
import { getOps02Decision, type Ops02Decision } from './ops02Policy'
import {
  allowedRolesForTier,
  isRoleAllowed,
  type AuthorizationTier,
} from './roleAuthorization'
import logger from '../utils/logger'

export type RouteAuthorizationOutcome =
  | 'allowed-read'
  | 'allowed-write'
  | 'denied'

export interface RouteAuthorizationAuditEvent {
  actorId: string
  actorRole: string
  method: string
  route: string
  tier: AuthorizationTier
  outcome: RouteAuthorizationOutcome
  correlationId?: string
}

export interface RouteAuthorizationDependencies {
  matchRoute: (method: string, path: string) => CatalogRouteMatch | null
  getDecision: (method: string, path: string) => Ops02Decision | null
  audit: (event: RouteAuthorizationAuditEvent) => void
}

const defaultDependencies: RouteAuthorizationDependencies = {
  matchRoute: matchCatalogRoute,
  getDecision: getOps02Decision,
  audit: (event) => {
    logger.info('Route authorization', event)
  },
}

function authorizationTier(
  route: CatalogRouteMatch,
  decision: Ops02Decision | null,
): AuthorizationTier {
  if (!route.writes && !route.destructive) return 'read'
  if (!decision) {
    throw new Error(`Missing OPS-02 decision for ${route.method.toUpperCase()} ${route.path}`)
  }
  return decision.authorization
}

function audit(
  dependencies: RouteAuthorizationDependencies,
  req: Request,
  res: Response,
  route: CatalogRouteMatch,
  tier: AuthorizationTier,
  outcome: RouteAuthorizationOutcome,
): void {
  if (!req.user) return

  const correlationId = res.locals.correlationId
  dependencies.audit({
    actorId: req.user.id,
    actorRole: req.user.role,
    method: req.method.toUpperCase(),
    route: route.path,
    tier,
    outcome,
    ...(typeof correlationId === 'string' && correlationId.length > 0
      ? { correlationId }
      : {}),
  })
}

export function createRouteAuthorization(
  dependencies: RouteAuthorizationDependencies = defaultDependencies,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    let route: CatalogRouteMatch | null
    try {
      route = dependencies.matchRoute(req.method, req.path)
    } catch (error) {
      return next(error)
    }

    if (!route || route.access !== 'authenticated') return next()

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Não autenticado',
      })
    }

    let tier: AuthorizationTier
    try {
      const decision = route.writes || route.destructive
        ? dependencies.getDecision(route.method, route.path)
        : null
      tier = authorizationTier(route, decision)
    } catch (error) {
      return next(error)
    }

    if (!isRoleAllowed(req.user.role, allowedRolesForTier(tier))) {
      audit(dependencies, req, res, route, tier, 'denied')
      return res.status(403).json({
        success: false,
        message: 'Sem permissões suficientes',
      })
    }

    audit(
      dependencies,
      req,
      res,
      route,
      tier,
      tier === 'read' ? 'allowed-read' : 'allowed-write',
    )
    return next()
  }
}

export const routeAuthorization = createRouteAuthorization()
