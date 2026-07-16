import type { Request, RequestHandler } from 'express'
import { getRequestRouteTemplate } from './requestRoute'
import { redactSensitiveData } from './redaction'
import logger from '../utils/logger'
import routeCatalog from '../security/route-catalog.json'

type CatalogRoute = {
  method: string
  path: string
  deprecated?: boolean
  sunset?: string
}

type MatchedRoute = CatalogRoute & { matcher: RegExp }

export interface RouteUsageLogEvent {
  method: string
  route: string
  authenticated: boolean
  mount?: 'api' | 'app'
}

export interface RouteUsageInstrumentation {
  handler: RequestHandler
}

export interface RouteUsageInstrumentationOptions {
  log?: {
    info(message: string, event: RouteUsageLogEvent): unknown
  }
}

const routesByBucket = buildRouteBuckets(routeCatalog as CatalogRoute[])

function normalizePath(value: string): string {
  const normalized = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
  return normalized.toLowerCase()
}

function bucketKey(method: string, routePath: string): string {
  const segments = normalizePath(routePath).split('/').filter(Boolean)
  return [method.toUpperCase(), ...segments.slice(0, 2)].join(' ')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileTemplate(template: string): RegExp {
  const pattern = normalizePath(template)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : escapeRegex(segment)))
    .join('/')
  return new RegExp(`^${pattern}/?$`, 'i')
}

function buildRouteBuckets(catalog: CatalogRoute[]): Map<string, MatchedRoute[]> {
  const buckets = new Map<string, MatchedRoute[]>()
  for (const route of catalog) {
    const key = bucketKey(route.method, route.path)
    const bucket = buckets.get(key) ?? []
    bucket.push({ ...route, matcher: compileTemplate(route.path) })
    buckets.set(key, bucket)
  }
  return buckets
}

function matchCatalogRoute(req: Request): MatchedRoute | undefined {
  const bucket = routesByBucket.get(bucketKey(req.method, req.path)) ?? []
  return bucket.find((route) => route.matcher.test(req.path))
}

function observableTemplate(template: string): string {
  return template.replace(/^\/api(?=\/|$)/i, '') || '/'
}

export function createRouteUsageInstrumentation(
  options: RouteUsageInstrumentationOptions = {},
): RouteUsageInstrumentation {
  const log = options.log ?? logger

  const handler: RequestHandler = (req, res, next) => {
    const catalogRoute = matchCatalogRoute(req)
    if (catalogRoute?.deprecated) {
      res.setHeader('Deprecation', 'true')
      if (catalogRoute.sunset) res.setHeader('Sunset', catalogRoute.sunset)
    }

    res.once('finish', () => {
      const event: RouteUsageLogEvent = {
        method: req.method,
        route: catalogRoute
          ? observableTemplate(catalogRoute.path)
          : getRequestRouteTemplate(req),
        authenticated: Boolean(req.user),
        ...(catalogRoute?.deprecated
          ? { mount: catalogRoute.path.startsWith('/api/') ? 'api' as const : 'app' as const }
          : {}),
      }
      log.info('HTTP route usage', redactSensitiveData(event))
    })

    next()
  }

  return { handler }
}
