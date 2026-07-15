import request from 'supertest'
import { createApp } from '../../src/app'
import {
  DEFAULT_RATE_LIMITS,
  HEAVY_OPERATION_PATHS,
  createHttpPerimeter,
  type HttpPerimeterLimits,
} from '../../src/security/httpPerimeter'
import { createErrorHandling } from '../../src/security/errorHandling'

const marker = { __bo2_offline_loopback: '1' }

function buildApp(limits: Partial<HttpPerimeterLimits> = {}, onRateLimit = jest.fn()) {
  return createApp({
    createErrorHandling: () =>
      createErrorHandling({
        generateCorrelationId: () => 'http-perimeter-correlation-id',
        logError: () => undefined,
      }),
    createHttpPerimeter: () => createHttpPerimeter({ limits, onRateLimit }),
    registerRoutes: (app) => {
      app.get('/probe', (_req, res) => res.sendStatus(204))
      app.post('/api/auth/login', (_req, res) => res.sendStatus(204))
      app.post('/api/guru/webhook', (_req, res) => res.sendStatus(204))
      app.post('/api/sync/execute-pipeline', (_req, res) => res.sendStatus(204))
      app.post('/echo', (req, res) => res.json(req.body))
    },
  })
}

test('Helmet envia headers seguros sem CSP e permite recursos cross-origin', async () => {
  const response = await request(buildApp()).get('/probe').query(marker).expect(204)

  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  expect(response.headers['content-security-policy']).toBeUndefined()
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

test('webhook devolve 429 e regista o bloqueio', async () => {
  const onRateLimit = jest.fn()
  const app = buildApp({ webhook: { limit: 1, windowMs: 60_000 } }, onRateLimit)
  const attempt = () =>
    request(app)
      .post('/api/guru/webhook')
      .set('X-Forwarded-For', '198.51.100.20')
      .query(marker)

  await attempt().expect(204)
  await attempt().expect(429)
  expect(onRateLimit).toHaveBeenCalledWith({ policy: 'webhook' })
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
  })
  expect(HEAVY_OPERATION_PATHS).toEqual([
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
  ])
})
