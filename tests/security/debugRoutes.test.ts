import type { Application, RequestHandler } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import { configureDebugRoutes, localDebugOnly } from '../../src/security/debugRoutes'
import { configureJwt, signAppToken } from '../../src/security/jwt'

const routes = [
  ['post', '/api/test/history/make-changes'],
] as const

beforeEach(() => {
  configureJwt({
    jwtSecret: 'debug-routes-jwt-secret-at-least-32-characters',
    oldApiJwtSecret: 'debug-routes-old-api-secret-at-least-32-characters',
    studentAccessJwtSecret: 'debug-routes-student-secret-at-least-32-characters',
  })
})

function superAdminAuthorization(): string {
  return `Bearer ${signAppToken({
    id: 'debug-routes-admin',
    email: 'admin@example.test',
    role: 'SUPER_ADMIN',
    permissions: [],
  })}`
}

function createDebugProbeApp(): Application {
  const handler: RequestHandler = (_req, res) => res.sendStatus(204)
  return createApp({
    authEnforce: true,
    registerRoutes: (app) => {
      for (const [method, path] of routes) app[method](path, localDebugOnly, handler)
    },
  })
}


test('rotas debug devolvem 404 quando a flag esta desligada', async () => {
  configureDebugRoutes({ enableDebugRoutes: false })
  const app = createDebugProbeApp()

  for (const [method, path] of routes) {
    await request(app)[method](path)
      .set('Authorization', superAdminAuthorization())
      .query({ __bo2_offline_loopback: '1' })
      .expect(404)
  }
})

test('rotas debug so ficam disponiveis com flag local explicita', async () => {
  configureDebugRoutes({ enableDebugRoutes: true })
  const app = createDebugProbeApp()

  for (const [method, path] of routes) {
    await request(app)[method](path)
      .set('Authorization', superAdminAuthorization())
      .query({ __bo2_offline_loopback: '1' })
      .expect(204)
  }
})
