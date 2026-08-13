import express, { type RequestHandler } from 'express'
import request from 'supertest'
import {
  createRouteAuthorization,
  type RouteAuthorizationAuditEvent,
  type RouteAuthorizationDependencies,
} from '../../src/security/routeAuthorization'
import type { CatalogRouteMatch } from '../../src/security/routeCatalogMatcher'
import type {
  Ops02Decision,
  Ops02ProtectionDisposition,
} from '../../src/security/ops02Policy'

interface RuntimeRouteAuthorizationDependencies extends RouteAuthorizationDependencies {
  audit: jest.Mock<void, [RouteAuthorizationAuditEvent]>
}

function offlineLoopback(path: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}__bo2_offline_loopback=1`
}

function user(role: string): RequestHandler {
  return (req, _res, next) => {
    req.user = {
      id: `${role.toLowerCase()}-id`,
      email: `${role.toLowerCase()}@example.test`,
      role,
      permissions: [],
    }
    next()
  }
}

function route(
  method: string,
  path: string,
  writes: boolean,
  destructive = false,
): CatalogRouteMatch {
  return { method, path, access: 'authenticated', writes, destructive }
}

function decision(
  method: string,
  path: string,
  authorization: 'internal-write' | 'super-admin',
): Ops02Decision {
  const protection: Ops02ProtectionDisposition = {
    status: 'not-applicable',
    reason: 'runtime-fixture',
  }
  return {
    method,
    path,
    scope: 'internal',
    authorization,
    destructive: authorization === 'super-admin',
    bulk: false,
    cap: protection,
    idempotency: protection,
    killSwitch: protection,
    dryRun: protection,
    reversibility: protection,
    status: 'reviewed',
    evidence: 'runtime-fixture',
  }
}

function dependencies(): RuntimeRouteAuthorizationDependencies {
  const routes = new Map<string, CatalogRouteMatch>([
    ['GET /api/read', route('GET', '/api/read', false)],
    ['POST /api/write', route('POST', '/api/write', true)],
    ['POST /api/high-impact', route('POST', '/api/high-impact', true, true)],
  ])
  const decisions = new Map<string, Ops02Decision>([
    ['POST /api/write', decision('POST', '/api/write', 'internal-write')],
    ['POST /api/high-impact', decision('POST', '/api/high-impact', 'super-admin')],
  ])
  const audit = jest.fn<void, [RouteAuthorizationAuditEvent]>()

  return {
    matchRoute: (method, path) => routes.get(`${method.toUpperCase()} ${path}`) ?? null,
    getDecision: (method, path) => decisions.get(`${method.toUpperCase()} ${path}`) ?? null,
    audit,
  }
}

function appFor(
  role: string,
  deps: RouteAuthorizationDependencies,
  handler = jest.fn((_req, res) => res.status(200).json({ ok: true })),
) {
  const app = express()
  app.use((req, res, next) => {
    res.locals.correlationId = 'request-id'
    next()
  })
  app.use(user(role))
  app.use(createRouteAuthorization(deps))
  app.get('/api/read', handler)
  app.post('/api/write', handler)
  app.post('/api/high-impact', handler)
  return { app, handler }
}

describe('central route authorization', () => {
  test('allows moderator to read', async () => {
    const deps = dependencies()
    const { app, handler } = appFor('MODERATOR', deps)

    await request(app).get(offlineLoopback('/api/read')).expect(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('denies moderator internal writes before handler', async () => {
    const deps = dependencies()
    const { app, handler } = appFor('MODERATOR', deps)

    await request(app).post(offlineLoopback('/api/write')).expect(403)
    expect(handler).not.toHaveBeenCalled()
  })

  test('allows admin internal writes', async () => {
    const deps = dependencies()
    const { app, handler } = appFor('ADMIN', deps)

    await request(app).post(offlineLoopback('/api/write')).expect(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('denies admin high-impact writes before handler', async () => {
    const deps = dependencies()
    const { app, handler } = appFor('ADMIN', deps)

    await request(app).post(offlineLoopback('/api/high-impact')).expect(403)
    expect(handler).not.toHaveBeenCalled()
  })

  test('allows super admin high-impact writes', async () => {
    const deps = dependencies()
    const { app, handler } = appFor('SUPER_ADMIN', deps)

    await request(app).post(offlineLoopback('/api/high-impact')).expect(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('preserves unmatched route 404 behavior', async () => {
    const deps = dependencies()
    const { app } = appFor('MODERATOR', deps)

    await request(app).get(offlineLoopback('/api/unknown')).expect(404)
  })

  test('fails closed when a cataloged write has no OPS-02 decision', async () => {
    const deps = dependencies()
    deps.getDecision = () => null
    const { app, handler } = appFor('ADMIN', deps)

    await request(app).post(offlineLoopback('/api/write')).expect(500)
    expect(handler).not.toHaveBeenCalled()
  })

  test('audits denied and allowed writes without request data', async () => {
    const deps = dependencies()
    const { app } = appFor('ADMIN', deps)

    await request(app)
      .post(offlineLoopback('/api/write?token=secret'))
      .set('Authorization', 'Bearer secret')
      .expect(200)

    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-id',
      actorRole: 'ADMIN',
      method: 'POST',
      route: '/api/write',
      tier: 'internal-write',
      outcome: 'allowed-write',
      correlationId: 'request-id',
    }))
    expect(JSON.stringify(deps.audit.mock.calls)).not.toMatch(/example\.test|Bearer|secret/i)
  })
})
