import type { Application, RequestHandler } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import { configureDebugRoutes, localDebugOnly } from '../../src/security/debugRoutes'

const routes = [
  ['get', '/api/guru/debug/token'],
  ['get', '/api/activecampaign/debug/curseduca-data'],
  ['post', '/api/webhooks/ac/test'],
  ['post', '/api/test/history/make-changes'],
] as const

function createDebugProbeApp(): Application {
  const handler: RequestHandler = (_req, res) => res.sendStatus(204)
  return createApp({
    registerRoutes: (app) => {
      for (const [method, path] of routes) app[method](path, localDebugOnly, handler)
    },
  })
}

test('rotas debug devolvem 404 quando a flag esta desligada', async () => {
  configureDebugRoutes({ enableDebugRoutes: false })
  const app = createDebugProbeApp()

  for (const [method, path] of routes) {
    await request(app)[method](path).query({ __bo2_offline_loopback: '1' }).expect(404)
  }
})

test('rotas debug so ficam disponiveis com flag local explicita', async () => {
  configureDebugRoutes({ enableDebugRoutes: true })
  const app = createDebugProbeApp()

  for (const [method, path] of routes) {
    await request(app)[method](path).query({ __bo2_offline_loopback: '1' }).expect(204)
  }
})
