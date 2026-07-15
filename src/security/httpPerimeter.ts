import type { RequestHandler } from 'express'
import helmet from 'helmet'
import { MemoryStore, rateLimit } from 'express-rate-limit'

export interface RateLimitPolicy {
  limit: number
  windowMs: number
}

export interface HttpPerimeterLimits {
  login: RateLimitPolicy
  webhook: RateLimitPolicy
  heavy: RateLimitPolicy
}

export type RateLimitPolicyName = keyof HttpPerimeterLimits

export interface HttpPerimeter {
  helmet: RequestHandler
  login: RequestHandler
  webhook: RequestHandler
  heavy: RequestHandler
}

export interface HttpPerimeterOptions {
  limits?: Partial<HttpPerimeterLimits>
  onRateLimit?: (event: { policy: RateLimitPolicyName }) => void
}

export const DEFAULT_RATE_LIMITS: HttpPerimeterLimits = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  webhook: { limit: 10_000, windowMs: 60_000 },
  heavy: { limit: 10, windowMs: 15 * 60_000 },
}

export const LOGIN_PATHS = ['/api/auth/login']

export const WEBHOOK_PATHS = [
  '/api/guru/webhook',
  '/api/webhooks/ac/email-opened',
  '/api/webhooks/ac/link-clicked',
]

export const HEAVY_OPERATION_PATHS = [
  '/api/sync/execute-pipeline',
  '/api/sync/hotmart',
  '/api/sync/hotmart/batch',
  '/api/sync/curseduca',
  '/api/sync/curseduca/batch',
  '/api/sync/discord',
  '/api/sync/discord/csv',
  '/api/sync/discord/batch',
  '/api/users/syncDiscordAndHotmart',
  '/api/users/bulkMerge',
  '/api/users/bulkDelete',
  '/api/users/bulkDeleteUnmatched',
  '/api/classes/syncHotmartClasses',
  '/api/classes/syncComplete',
  '/api/dashboard/stats/v3/rebuild',
  '/api/analytics/product-sales/rebuild',
  '/cron-tags/execute',
  '/cron-tags/execute-legacy',
  '/api/cron/jobs/:id/trigger',
  '/api/cron/tag-rules-only',
  '/api/renewal/sync',
  '/api/renewal-ac/execute',
  '/api/guru/sync/all',
  '/api/guru/snapshots/historical',
  '/api/guru/inactivation/bulk',
  '/api/guru/inactivation/cleanup',
  '/api/guru/trials/sync',
]

function createLimiter(
  policy: RateLimitPolicyName,
  settings: RateLimitPolicy,
  onRateLimit: (event: { policy: RateLimitPolicyName }) => void,
): RequestHandler {
  return rateLimit({
    windowMs: settings.windowMs,
    limit: settings.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: policy,
    store: new MemoryStore(),
    handler: (_req, res) => {
      onRateLimit({ policy })
      res.status(429).json({ success: false, message: 'Demasiados pedidos' })
    },
  })
}

export function createHttpPerimeter(options: HttpPerimeterOptions = {}): HttpPerimeter {
  const limits: HttpPerimeterLimits = {
    login: options.limits?.login ?? DEFAULT_RATE_LIMITS.login,
    webhook: options.limits?.webhook ?? DEFAULT_RATE_LIMITS.webhook,
    heavy: options.limits?.heavy ?? DEFAULT_RATE_LIMITS.heavy,
  }
  const onRateLimit =
    options.onRateLimit ??
    ((event) => console.warn('[RATE_LIMIT] pedido bloqueado', { policy: event.policy }))

  return {
    helmet: helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
    login: createLimiter('login', limits.login, onRateLimit),
    webhook: createLimiter('webhook', limits.webhook, onRateLimit),
    heavy: createLimiter('heavy', limits.heavy, onRateLimit),
  }
}
