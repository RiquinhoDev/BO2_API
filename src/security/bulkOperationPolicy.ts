import type { RequestHandler } from 'express'
import { HttpError } from './errorHandling'
import { matchCatalogRoute } from './routeCatalogMatcher'

export const MAX_BULK_OPERATION_ITEMS = 200

type BulkLimitRule =
  | { arrayField: string }
  | { numberField: string }

const BULK_LIMIT_RULES = new Map<string, BulkLimitRule>([
  ['POST /api/users/bulkMerge', { arrayField: 'ids' }],
  ['POST /api/users/bulkDelete', { arrayField: 'ids' }],
  ['POST /api/users/bulkDeleteUnmatched', { arrayField: 'ids' }],
  ['POST /api/guru/inactivation/mark-discrepancies', { arrayField: 'emails' }],
  ['POST /api/guru/inactivation/bulk', { arrayField: 'userProductIds' }],
  ['POST /api/guru/inactivation/cleanup-duplicates', { arrayField: 'userProductIds' }],
  ['POST /api/guru/inactivation/mark-stale-inactive', { arrayField: 'emails' }],
  ['POST /api/guru/inactivation/restore', { arrayField: 'userProductIds' }],
  ['POST /api/guru/inactivation/fix-to-active', { arrayField: 'emails' }],
  ['POST /api/guru/inactivation/diagnose', { arrayField: 'emails' }],
  ['POST /api/sync/conflicts/bulk-resolve', { arrayField: 'conflictIds' }],
  ['POST /api/sync/conflicts/auto-resolve', { arrayField: 'conflictIds' }],
  ['POST /api/test/history/populate-all-users', { numberField: 'limit' }],
])

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

function bulkLimitError(): HttpError {
  return new HttpError({
    status: 400,
    code: 'INVALID_REQUEST',
    publicMessage: 'Pedido inválido',
  })
}

function bodyObject(value: unknown): object | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

function exceedsRule(body: object, rule: BulkLimitRule): boolean {
  if ('arrayField' in rule) {
    const value = Reflect.get(body, rule.arrayField)
    return Array.isArray(value) && value.length > MAX_BULK_OPERATION_ITEMS
  }

  const value = Reflect.get(body, rule.numberField)
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > MAX_BULK_OPERATION_ITEMS
}

export const bulkOperationGuard: RequestHandler = (req, _res, next) => {
  const route = matchCatalogRoute(req.method, req.path)
  if (!route) return next()

  const rule = BULK_LIMIT_RULES.get(routeKey(route.method, route.path))
  if (!rule) return next()

  const body = bodyObject(req.body)
  if (!body || !exceedsRule(body, rule)) return next()

  return next(bulkLimitError())
}

export function enforceBulkBodyArrayLimit(field: string): RequestHandler {
  return (req, _res, next) => {
    const body = bodyObject(req.body)
    if (!body) return next()

    const value = Reflect.get(body, field)
    if (Array.isArray(value) && value.length > MAX_BULK_OPERATION_ITEMS) {
      return next(bulkLimitError())
    }

    return next()
  }
}
