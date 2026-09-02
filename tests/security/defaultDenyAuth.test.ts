import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Application } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import { configureJwt, signAppToken } from '../../src/security/jwt'
import { createHttpPerimeter } from '../../src/security/httpPerimeter'

type Access = 'public' | 'authenticated' | 'signature' | 'dead'
type CatalogRoute = { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; access: Access }

const JWT_SECRET = 'f2-default-deny-jwt-secret-at-least-32-characters'
const OLD_API_JWT_SECRET = 'f2-default-deny-old-api-secret-at-least-32-characters'
const STUDENT_ACCESS_JWT_SECRET = 'f2-default-deny-student-secret-at-least-32-characters'
const AC_SECRET = 'f2-activecampaign-secret-at-least-32-characters'
const AC_HEADER = 'X-ActiveCampaign-Signature'
const marker = { __bo2_offline_loopback: '1' }
const catalog = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'src/security/route-catalog.json'), 'utf8'),
) as CatalogRoute[]

function concretePath(routePath: string): string {
  return routePath.replace(/:[^/]+/g, 'probe')
}

function buildCatalogProbe(authEnforce = true): Application {
  return createApp({
    authEnforce,
    allowedOrigins: ['http://localhost:3000'],
    createHttpPerimeter: () => createHttpPerimeter({
      limits: {
        login: { limit: 10_000, windowMs: 60_000 },
        webhook: { limit: 10_000, windowMs: 60_000 },
        heavy: { limit: 10_000, windowMs: 60_000 },
      },
    }),
    acWebhookSecret: AC_SECRET,
    acWebhookReplayStore: {
      claim: async () => ({ token: 'catalog-probe' }),
      complete: async () => undefined,
      release: async () => undefined,
    },
    registerRoutes: (app) => {
      for (const route of catalog) {
        const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
        app[method](route.path, (_req, res) => res.sendStatus(204))
      }
      app.get('/api/catalog-drift-probe', (_req, res) => res.sendStatus(204))
      app.get('/cron-tags/catalog-drift-probe', (_req, res) => res.sendStatus(204))
    },
  })
}

function unsignedRequest(app: Application, route: CatalogRoute) {
  const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
  const target = request(app)[method](concretePath(route.path)).query(marker)
  if (route.path.startsWith('/api/webhooks/ac/')) {
    const body = '{}'
    return target
      .set('Content-Type', 'application/json')
      .set(AC_HEADER, createHmac('sha256', AC_SECRET).update(body).digest('hex'))
      .send(body)
  }
  return target
}

jest.setTimeout(60_000)

beforeEach(() =>
  configureJwt({
    jwtSecret: JWT_SECRET,
    oldApiJwtSecret: OLD_API_JWT_SECRET,
    studentAccessJwtSecret: STUDENT_ACCESS_JWT_SECRET,
  }),
)

test('o catalogo inteiro aplica 401 ou bypass sem JWT conforme o access', async () => {
  const app = buildCatalogProbe()
  expect(catalog).toHaveLength(418)

  for (const route of catalog) {
    const expected = route.access === 'public' || route.access === 'signature' ? 204 : 401
    await unsignedRequest(app, route).expect(expected)
  }
})

test('token SUPER_ADMIN valido atravessa todas as rotas authenticated', async () => {
  const app = buildCatalogProbe()
  const token = signAppToken({ id: 'admin-1', email: 'admin@example.test', role: 'SUPER_ADMIN', permissions: [] })
  const authenticated = catalog.filter((route) => route.access === 'authenticated')
  expect(authenticated).toHaveLength(402)

  for (const route of authenticated) {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    const response = await request(app)[method](concretePath(route.path))
      .set('Authorization', ['Bearer', token].join(' '))
      .query(marker)
    expect({ route: `${route.method} ${route.path}`, status: response.status, body: response.body })
      .toEqual({ route: `${route.method} ${route.path}`, status: 204, body: {} })
  }
})

test('rota ausente do catalogo falha fechada em cada raiz protegida', async () => {
  const app = buildCatalogProbe()
  await request(app).get('/api/catalog-drift-probe').query(marker).expect(401)
})

test('nao permite bypass por diferenca de caixa ou barra final', async () => {
  const app = buildCatalogProbe()
  await request(app).get('/API/users/analytics').query(marker).expect(401)
  await request(app).get('/api/users/analytics/').query(marker).expect(401)
})

test('preflight CORS termina antes da guarda JWT', async () => {
  await request(buildCatalogProbe())
    .options('/api/users/analytics')
    .set('Origin', 'http://localhost:3000')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'Authorization')
    .query(marker)
    .expect(204)
})

test('AUTH_ENFORCE=false preserva explicitamente o comportamento antigo', async () => {
  const response = await request(buildCatalogProbe(false))
    .get('/api/users/analytics')
    .query(marker)
  expect({ status: response.status, body: response.body }).toEqual({ status: 204, body: {} })
})
