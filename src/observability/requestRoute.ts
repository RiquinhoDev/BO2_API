import type { Request } from 'express'

const PII_ROUTE_TEMPLATES: ReadonlyArray<[RegExp, string]> = [
  [/^\/api\/users\/by-email\/[^/]+$/i, '/users/by-email/:email'],
  [/^\/api\/ac\/contact\/[^/]+\/tags$/i, '/ac/contact/:email/tags'],
  [/^\/api\/guru\/sync\/email\/[^/]+$/i, '/guru/sync/email/:email'],
]

export function getRequestRouteTemplate(req: Request): string {
  const pathname = req.originalUrl.split(/[?#]/, 1)[0]
  const known = PII_ROUTE_TEMPLATES.find(([pattern]) => pattern.test(pathname))
  if (known) return known[1]

  const routePath = typeof req.route?.path === 'string' ? req.route.path : undefined
  if (!routePath) return '[unmatched]'
  return `${req.baseUrl}${routePath}`.replace(/^\/api(?=\/|$)/, '') || '/'
}
