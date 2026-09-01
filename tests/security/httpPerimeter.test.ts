import request from 'supertest'
import type { Options, Store } from 'express-rate-limit'
import { createApp } from '../../src/app'
import {
  DEFAULT_RATE_LIMITS,
  HEAVY_OPERATION_PATHS,
  SUGGESTION_PATHS,
  createHttpPerimeter,
  type HttpPerimeterLimits,
} from '../../src/security/httpPerimeter'
import type { RateLimitStoreFactory } from '../../src/security/redisRateLimitStore'
import { createErrorHandling } from '../../src/security/errorHandling'

const marker = { __bo2_offline_loopback: '1' }

const API_ONLY_CSP = {
  'default-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'none'"],
}

function parseCspDirectives(header: string | undefined): Record<string, string[]> {
  if (!header) throw new Error('Content-Security-Policy header is missing')

  const directives = header
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const [name, ...values] = directive.split(/\s+/)
      return [name, values] as [string, string[]]
    })

  expect(new Set(directives.map(([name]) => name)).size).toBe(directives.length)
  return Object.fromEntries(directives)
}

function expectApiOnlyCsp(header: string | undefined): void {
  expect(parseCspDirectives(header)).toEqual(API_ONLY_CSP)
}

function createDeterministicStore(): Store {
  const hits = new Map<string, number>()
  let windowMs = 60_000

  return {
    localKeys: true,
    init: (options: Options) => {
      windowMs = options.windowMs
    },
    increment: (key: string) => {
      const totalHits = (hits.get(key) ?? 0) + 1
      hits.set(key, totalHits)
      return {
        totalHits,
        resetTime: new Date(1_700_000_000_000 + windowMs),
      }
    },
    decrement: (key: string) => {
      const totalHits = hits.get(key) ?? 0
      if (totalHits <= 1) hits.delete(key)
      else hits.set(key, totalHits - 1)
    },
    resetKey: (key: string) => {
      hits.delete(key)
    },
  }
}

function createDeterministicStoreFactory(): RateLimitStoreFactory {
  return () => createDeterministicStore()
}

function buildApp(
  limits: Partial<HttpPerimeterLimits> = {},
  onRateLimit = jest.fn(),
  storeFactory?: RateLimitStoreFactory,
) {
  return createApp({
    authEnforce: false,
    allowedOrigins: ['http://localhost:3000'],
    createErrorHandling: () =>
      createErrorHandling({
        generateCorrelationId: () => 'http-perimeter-correlation-id',
        logError: () => undefined,
      }),
    createHttpPerimeter: () =>
      createHttpPerimeter({
        limits,
        onRateLimit,
        storeFactory: storeFactory ?? createDeterministicStoreFactory(),
      }),
    registerRoutes: (app) => {
      app.get('/probe', (_req, res) => res.sendStatus(204))
      app.post('/api/auth/login', (_req, res) => res.sendStatus(204))
      app.post('/api/guru/webhook', (_req, res) => res.sendStatus(204))
      app.post('/api/sync/execute-pipeline', (_req, res) => res.sendStatus(204))
      app.post('/api/clareza/suggestions', (_req, res) => res.sendStatus(204))
      app.post('/echo', (req, res) => res.json(req.body))
    },
  })
}

test('usa a factory de stores para cada politica de rate limit', () => {
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => createDeterministicStore(),
  )

  buildApp({}, jest.fn(), storeFactory)

  expect(storeFactory).toHaveBeenCalledWith('login')
  expect(storeFactory).toHaveBeenCalledWith('webhook')
  expect(storeFactory).toHaveBeenCalledWith('heavy')
})

test('Helmet envia apenas CSP API e permite recursos cross-origin em 204', async () => {
  const response = await request(buildApp()).get('/probe').query(marker).expect(204)

  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  expectApiOnlyCsp(response.headers['content-security-policy'])
})

test('Helmet envia apenas CSP API no preflight OPTIONS', async () => {
  const response = await request(buildApp())
    .options('/probe')
    .set('Origin', 'http://localhost:3000')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'Authorization')
    .query(marker)
    .expect(204)

  expectApiOnlyCsp(response.headers['content-security-policy'])
})

test('Helmet envia apenas CSP API quando o limiter devolve 429', async () => {
  const app = buildApp({ login: { limit: 1, windowMs: 60_000 } })
  const attempt = () => request(app).post('/api/auth/login').query(marker)

  await attempt().expect(204)
  const response = await attempt().expect(429)

  expectApiOnlyCsp(response.headers['content-security-policy'])
})

test('login devolve 429 depois do limite', async () => {
  const app = buildApp({ login: { limit: 2, windowMs: 60_000 } })
  const attempt = () =>
    request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.10')
      .query(marker)

  await attempt().expect(204)
  await attempt().expect(204)
  await attempt().expect(429)
})

test('trust proxy 1 separa clientes por X-Forwarded-For', async () => {
  const app = buildApp({ login: { limit: 1, windowMs: 60_000 } })
  const attempt = (ip: string) =>
    request(app).post('/api/auth/login').set('X-Forwarded-For', ip).query(marker)

  await attempt('198.51.100.11').expect(204)
  await attempt('198.51.100.12').expect(204)
  await attempt('198.51.100.11').expect(429)
})

test('login devolve envelope 429 estavel e regista apenas a politica e correlacao', async () => {
  const onRateLimit = jest.fn()
  const app = buildApp({ login: { limit: 1, windowMs: 60_000 } }, onRateLimit)
  const attempt = () =>
    request(app).post('/api/auth/login').set('X-Request-ID', 'limiter-request-123').query(marker)

  await attempt().expect(204)
  const response = await attempt().expect(429)

  expect(response.headers['x-request-id']).toBe('limiter-request-123')
  expect(response.body).toEqual({
    success: false,
    code: 'RATE_LIMITED',
    message: 'Demasiados pedidos',
    correlationId: 'limiter-request-123',
  })
  expect(onRateLimit).toHaveBeenCalledTimes(1)
  expect(onRateLimit).toHaveBeenCalledWith({
    policy: 'login',
    correlationId: 'limiter-request-123',
  })
})

test('429 usa correlacao gerada quando X-Request-ID e invalido e demasiado longo', async () => {
  const onRateLimit = jest.fn()
  const app = buildApp({ login: { limit: 1, windowMs: 60_000 } }, onRateLimit)
  const rawRequestId = `raw-${'x'.repeat(130)}!`
  const attempt = () =>
    request(app)
      .post('/api/auth/login')
      .set('X-Request-ID', rawRequestId)
      .query(marker)

  await attempt().expect(204)
  const response = await attempt().expect(429)
  const correlationId = 'http-perimeter-correlation-id'

  expect(response.headers['x-request-id']).toBe(correlationId)
  expect(response.body).toEqual({
    success: false,
    code: 'RATE_LIMITED',
    message: 'Demasiados pedidos',
    correlationId,
  })
  expect(onRateLimit).toHaveBeenCalledWith({ policy: 'login', correlationId })
  expect(response.headers['x-request-id']).not.toBe(rawRequestId)
  expect(JSON.stringify(response.body)).not.toContain(rawRequestId)
})

test('operacao pesada devolve 429 depois do limite', async () => {
  const app = buildApp({ heavy: { limit: 1, windowMs: 60_000 } })
  const attempt = () =>
    request(app)
      .post('/api/sync/execute-pipeline')
      .set('X-Forwarded-For', '198.51.100.30')
      .query(marker)

  await attempt().expect(204)
  await attempt().expect(429)
})

test('sugestao publica tem limite proprio por cliente', async () => {
  const app = buildApp({ suggestion: { limit: 1, windowMs: 60_000 } })
  const attempt = () => request(app)
    .post('/api/clareza/suggestions')
    .set('X-Forwarded-For', '198.51.100.31')
    .query(marker)

  await attempt().expect(204)
  await attempt().expect(429)
})

test('cada app recebe stores de rate limit independentes', async () => {
  const first = buildApp({ login: { limit: 1, windowMs: 60_000 } })
  const second = buildApp({ login: { limit: 1, windowMs: 60_000 } })

  await request(first)
    .post('/api/auth/login')
    .set('X-Forwarded-For', '198.51.100.40')
    .query(marker)
    .expect(204)
  await request(second)
    .post('/api/auth/login')
    .set('X-Forwarded-For', '198.51.100.40')
    .query(marker)
    .expect(204)
})

test('body JSON acima de 100 KB devolve 413', async () => {
  const response = await request(buildApp())
    .post('/echo')
    .query(marker)
    .send({ payload: 'x'.repeat(101 * 1024) })
    .expect(413)

  expect(response.body).toEqual({
    success: false,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Pedido demasiado grande',
    correlationId: 'http-perimeter-correlation-id',
  })
})

test('body JSON malformado devolve 400 sem parecer erro interno', async () => {
  const response = await request(buildApp())
    .post('/echo')
    .set('Content-Type', 'application/json')
    .query(marker)
    .send('{"payload":')
    .expect(400)

  expect(response.body).toEqual({
    success: false,
    code: 'INVALID_JSON',
    message: 'JSON inválido',
    correlationId: 'http-perimeter-correlation-id',
  })
})

test('limites de producao e paths pesados ficam explicitos', () => {
  expect(DEFAULT_RATE_LIMITS).toEqual({
    login: { limit: 10, windowMs: 15 * 60_000 },
    webhook: { limit: 10_000, windowMs: 60_000 },
    heavy: { limit: 10, windowMs: 15 * 60_000 },
    suggestion: { limit: 20, windowMs: 15 * 60_000 },
  })
  expect(SUGGESTION_PATHS).toEqual(['/api/clareza/suggestions'])
  expect(HEAVY_OPERATION_PATHS).toEqual([
    '/api/sync/execute-pipeline',
    '/api/sync/hotmart',
    '/api/sync/hotmart/batch',
    '/api/sync/curseduca',
    '/api/sync/curseduca/batch',
    '/api/users/syncDiscordAndHotmart',
    '/api/users/bulkMerge',
    '/api/users/bulkDelete',
    '/api/users/bulkDeleteUnmatched',
    '/api/classes/syncHotmartClasses',
    '/api/classes/syncComplete',
    '/api/dashboard/materialized-stats/rebuild',
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
  ])
})
