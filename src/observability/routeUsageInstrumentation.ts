import type { Request, RequestHandler } from 'express'
import { getRequestRouteTemplate } from './requestRoute'
import { redactSensitiveData } from './redaction'
import logger from '../utils/logger'
import routeCatalog from '../security/route-catalog.json'
import { countUsage, observeUsage } from './usage/usageMeter'
import { statusClass, USAGE_METRICS } from './usage/usageMetrics'

type CatalogRoute = {
  method: string
  path: string
  deprecated?: boolean
  sunset?: string
  successorLinks?: string[]
}

type MatchedRoute = CatalogRoute & { matcher: RegExp }

export interface RouteUsageLogEvent {
  method: string
  route: string
  authenticated: boolean
  mount?: 'api' | 'app'
  successorLinks?: string[]
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

function templateSegmentRank(segment: string): number {
  if (segment === '*' || segment.startsWith('*')) return 0
  if (segment.startsWith(':')) return 1
  return 2
}

export function compareRouteTemplateSpecificity(
  left: string,
  right: string,
): number {
  const leftSegments = normalizePath(left).split('/').filter(Boolean)
  const rightSegments = normalizePath(right).split('/').filter(Boolean)
  const sharedLength = Math.min(leftSegments.length, rightSegments.length)

  for (let index = 0; index < sharedLength; index += 1) {
    const rankDifference = templateSegmentRank(rightSegments[index])
      - templateSegmentRank(leftSegments[index])
    if (rankDifference !== 0) return rankDifference
  }

  const lengthDifference = rightSegments.length - leftSegments.length
  return lengthDifference !== 0 ? lengthDifference : left.localeCompare(right)
}

function compileTemplate(template: string): RegExp {
  const pattern = normalizePath(template)
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) return '[^/]+'
      if (segment === '*' || segment.startsWith('*')) return '.+'
      return escapeRegex(segment)
    })
    .join('/')
  return new RegExp(`^${pattern}/?$`, 'i')
}

export function routeTemplateMatchesPath(
  template: string,
  actualPath: string,
): boolean {
  return compileTemplate(template).test(actualPath)
}

function buildRouteBuckets(catalog: CatalogRoute[]): Map<string, MatchedRoute[]> {
  const buckets = new Map<string, MatchedRoute[]>()
  for (const route of catalog) {
    const key = bucketKey(route.method, route.path)
    const bucket = buckets.get(key) ?? []
    bucket.push({ ...route, matcher: compileTemplate(route.path) })
    buckets.set(key, bucket)
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) =>
      compareRouteTemplateSpecificity(left.path, right.path))
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

function catalogMount(routePath: string): 'api' | 'app' {
  return routePath.startsWith('/api/') ? 'api' : 'app'
}

export function createRouteUsageInstrumentation(
  options: RouteUsageInstrumentationOptions = {},
): RouteUsageInstrumentation {
  const log = options.log ?? logger

  const handler: RequestHandler = (req, res, next) => {
    const startedAt = process.hrtime.bigint()
    // Bytes ja escritos nesta ligacao antes do pedido. A diferenca no fim mede
    // o que saiu mesmo pela rede — depois da compressao, que e o que o Railway
    // factura. Content-Length nao serve: com compressao a resposta vai em
    // chunks e o cabecalho nem existe.
    const socketBytesAtStart = req.socket?.bytesWritten ?? null
    const catalogRoute = matchCatalogRoute(req)
    if (catalogRoute?.deprecated) {
      res.setHeader('Deprecation', 'true')
      if (catalogRoute.sunset) res.setHeader('Sunset', catalogRoute.sunset)
      if (catalogRoute.successorLinks?.length) {
        res.setHeader('Link', catalogRoute.successorLinks)
      }
    }

    res.once('finish', () => {
      const route = catalogRoute
        ? observableTemplate(catalogRoute.path)
        : getRequestRouteTemplate(req)
      const method = req.method.toUpperCase()
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000

      countUsage(USAGE_METRICS.httpRequests, {
        route,
        method,
        status: statusClass(res.statusCode),
      })
      observeUsage(USAGE_METRICS.httpLatency, elapsedMs, { route, method })

      const socketBytesAtEnd = req.socket?.bytesWritten ?? null
      if (socketBytesAtStart !== null && socketBytesAtEnd !== null) {
        const written = socketBytesAtEnd - socketBytesAtStart
        if (written > 0) countUsage(USAGE_METRICS.httpResponseBytes, { route }, written)
      }

      const event: RouteUsageLogEvent = {
        method: req.method,
        route,
        authenticated: Boolean(req.user),
        ...(catalogRoute?.deprecated
          ? { mount: catalogMount(catalogRoute.path) }
          : {}),
        ...(catalogRoute?.successorLinks?.length
          ? { successorLinks: catalogRoute.successorLinks }
          : {}),
      }
      log.info('HTTP route usage', redactSensitiveData(event))
    })

    next()
  }

  return { handler }
}
