import type { Application, RequestHandler } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import { debugCurseducaAPI } from '../../src/controllers/syncUtilizadoresControllers/curseduca.controller'
import { configureDebugRoutes, localDebugOnly } from '../../src/security/debugRoutes'

const routes = [
  ['get', '/api/guru/debug/token'],
  ['get', '/api/activecampaign/debug/curseduca-data'],
  ['post', '/api/test/history/make-changes'],
] as const

function createDebugProbeApp(): Application {
  const handler: RequestHandler = (_req, res) => res.sendStatus(204)
  return createApp({
    authEnforce: false,
    registerRoutes: (app) => {
      for (const [method, path] of routes) app[method](path, localDebugOnly, handler)
    },
  })
}

function createRealCurseducaDebugApp(): Application {
  return createApp({
    authEnforce: false,
    registerRoutes: (app) => {
      app.get('/api/curseduca/debug', localDebugOnly, debugCurseducaAPI)
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

test('handler deprecated do CursEduca continua 501 quando debug local esta ativo', async () => {
  configureDebugRoutes({ enableDebugRoutes: true })

  await request(createRealCurseducaDebugApp())
    .get('/api/curseduca/debug')
    .query({ __bo2_offline_loopback: '1' })
    .expect(501)
    .expect(({ body }) => {
      expect(body).toMatchObject({ success: false, message: 'Endpoint deprecado' })
    })
})
