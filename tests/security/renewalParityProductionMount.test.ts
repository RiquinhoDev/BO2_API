import type { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import request from 'supertest'

import { createApp } from '../../src/app'
import acRenewalDataRouter from '../../src/routes/acRenewalData.routes'
import acTagWatchRouter from '../../src/routes/acTagWatch.routes'
import hotmartSalesHistoryRouter from '../../src/routes/hotmartSalesHistory.routes'
import productSalesPerformanceRouter from '../../src/routes/productSalesPerformance.routes'
import renewalAcRouter from '../../src/routes/renewalAc.routes'
import renewalTimelineRouter from '../../src/routes/renewalTimeline.routes'
import { createErrorHandling } from '../../src/security/errorHandling'
import { createHttpPerimeter } from '../../src/security/httpPerimeter'
import { registerRoutes } from '../../src/runtime/registerRoutes'

type RouteLayer = {
  route?: {
    path: string
    methods: Record<string, boolean>
    stack: Array<{ handle: RequestHandler }>
  }
}

const targets = [
  { router: acRenewalDataRouter, prefix: '/api/renewal-ac-data', routes: [['get', '/'], ['get', '/status'], ['post', '/sync']] },
  { router: acTagWatchRouter, prefix: '/api/ac-tag-watch', routes: [['get', '/status'], ['get', '/eventos'], ['post', '/eventos/:id/aceitar'], ['post', '/lotes/:lote/aceitar'], ['post', '/correr']] },
  { router: hotmartSalesHistoryRouter, prefix: '/api/renewal-hotmart-sales', routes: [['get', '/status'], ['get', '/history'], ['post', '/sync']] },
  { router: productSalesPerformanceRouter, prefix: '/api/products-sales-performance', routes: [['get', '/status'], ['get', '/performance'], ['post', '/sync']] },
  { router: renewalTimelineRouter, prefix: '/api/renewal-timeline', routes: [['get', '/status'], ['get', '/'], ['post', '/generate']] },
  { router: renewalAcRouter, prefix: '/api/renewal-ac', routes: [['post', '/turma-tags/sync'], ['post', '/refunds/handle']] },
] as const

const restored: Array<() => void> = []

function stubTargetHandlers(router: Router, routePaths: readonly (readonly [string, string])[]): void {
  const layers = (router as unknown as { stack: RouteLayer[] }).stack
  for (const [method, routePath] of routePaths) {
    const layer = layers.find(candidate => candidate.route?.path === routePath && candidate.route.methods[method])
    if (!layer?.route) throw new Error(`missing test route ${method.toUpperCase()} ${routePath}`)
    for (const handlerLayer of layer.route.stack) {
      const original = handlerLayer.handle
      handlerLayer.handle = ((_req: Request, res: Response) => res.sendStatus(204)) as RequestHandler
      restored.push(() => { handlerLayer.handle = original })
    }
  }
}

beforeAll(() => {
  for (const target of targets) stubTargetHandlers(target.router, target.routes)
})

afterAll(() => {
  for (const restore of restored.reverse()) restore()
})

function app() {
  return createApp({
    authEnforce: true,
    allowedOrigins: ['http://localhost:3000'],
    authenticateRequest: (req: Request, res: Response, next: NextFunction) => {
      if (req.get('authorization') !== 'Bearer mount-test') return res.sendStatus(401)
      req.user = { id: 'admin-1', email: 'admin@example.test', role: 'SUPER_ADMIN', permissions: [] }
      next()
    },
    createHttpPerimeter: () => createHttpPerimeter({ limits: {
      login: { limit: 10_000, windowMs: 60_000 },
      webhook: { limit: 10_000, windowMs: 60_000 },
      heavy: { limit: 10_000, windowMs: 60_000 },
      suggestion: { limit: 10_000, windowMs: 60_000 },
    } }),
    createErrorHandling: () => createErrorHandling({ logError: () => undefined }),
    registerRoutes,
  })
}

function concretePath(prefix: string, routePath: string): string {
  return `${prefix}${routePath === '/' ? '' : routePath}`
    .replace(':id', '507f1f77bcf86cd799439011')
    .replace(':lote', 'batch-a')
}

test('all 19 renewal parity routes deny unauthenticated requests and resolve after authentication', async () => {
  const production = app()
  for (const target of targets) {
    for (const [method, routePath] of target.routes) {
      const path = concretePath(target.prefix, routePath)
      await request(production)[method](path).query({ __bo2_offline_loopback: '1' }).expect(401)
      await request(production)[method](path).query({ __bo2_offline_loopback: '1' })
        .set('Authorization', 'Bearer mount-test').expect(204)
    }
  }
  await request(production).get('/api/renewal-ac-data/not-real')
    .query({ __bo2_offline_loopback: '1' })
    .set('Authorization', 'Bearer mount-test').expect(404)
})
