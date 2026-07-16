import type { RequestHandler } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import * as redaction from '../../src/observability/redaction'
import {
  createRouteUsageInstrumentation,
  type RouteUsageLogEvent,
} from '../../src/observability/routeUsageInstrumentation'

const marker = { __bo2_offline_loopback: '1' }

function buildProbe(
  events: RouteUsageLogEvent[],
  authEnforce = false,
  authenticateRequest?: RequestHandler,
) {
  const info = jest.fn((_message: string, event: RouteUsageLogEvent) => events.push(event))
  const instrumentation = createRouteUsageInstrumentation({ log: { info } })

  return {
    app: createApp({
      authEnforce,
      authenticateRequest,
      createRouteUsageInstrumentation: () => instrumentation,
      registerRoutes: (app) => {
        app.get('/api/users/by-email/:email', (_req, res) => res.sendStatus(204))
        app.get('/api/cron/status', (_req, res) => res.sendStatus(204))
        app.get('/api/cron-tags/status', (_req, res) => res.sendStatus(204))
        app.get('/cron-tags/status', (_req, res) => res.sendStatus(204))
      },
    }),
    info,
  }
}

test('regista o template da rota sem o email real', async () => {
  const events: RouteUsageLogEvent[] = []
  const { app, info } = buildProbe(events)

  await request(app)
    .get('/api/users/by-email/joao%40example.com')
    .query(marker)
    .expect(204)

  expect(info).toHaveBeenCalledWith('HTTP route usage', {
    method: 'GET',
    route: '/users/by-email/:email',
    authenticated: false,
  })
  expect(JSON.stringify(events)).not.toContain('joao')
})

test('regista se a autenticacao terminou antes da resposta', async () => {
  const events: RouteUsageLogEvent[] = []
  const authenticateRequest: RequestHandler = (req, _res, next) => {
    req.user = {
      id: 'admin-1',
      email: 'admin@example.test',
      role: 'ADMIN',
      permissions: [],
    }
    next()
  }
  const { app } = buildProbe(events, true, authenticateRequest)

  await request(app)
    .get('/api/users/by-email/joao@example.com')
    .query(marker)
    .expect(204)

  expect(events).toEqual([
    { method: 'GET', route: '/users/by-email/:email', authenticated: true },
  ])
})

test('consome a funcao unica de redacao da F1.8', async () => {
  const redact = jest.spyOn(redaction, 'redactSensitiveData')
  const { app } = buildProbe([])

  await request(app)
    .get('/api/users/by-email/joao@example.com')
    .query(marker)
    .expect(204)

  expect(redact).toHaveBeenCalledWith({
    method: 'GET',
    route: '/users/by-email/:email',
    authenticated: false,
  })
  redact.mockRestore()
})

test('distingue as montagens api e app no log de uso', async () => {
  const events: RouteUsageLogEvent[] = []
  const { app } = buildProbe(events)

  await request(app).get('/api/cron-tags/status').query(marker).expect(204)
  await request(app).get('/cron-tags/status').query(marker).expect(204)

  expect(events.map(({ route, mount }) => ({ route, mount }))).toEqual([
    { route: '/cron-tags/status', mount: 'api' },
    { route: '/cron-tags/status', mount: 'app' },
  ])
})

test('emite Deprecation nas 18 rotas cron-tags sem marcar a familia cron viva', async () => {
  const { app } = buildProbe([])

  for (const route of ['/api/cron-tags/status', '/cron-tags/status']) {
    const response = await request(app).get(route).query(marker).expect(204)
    expect(response.headers.deprecation).toBe('true')
    expect(response.headers.sunset).toBeUndefined()
  }

  const live = await request(app).get('/api/cron/status').query(marker).expect(204)
  expect(live.headers.deprecation).toBeUndefined()
})
