import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import Transport from 'winston-transport'
import { createApp } from '../../src/app'
import { createAuthenticate } from '../../src/middleware/auth.middleware'
import { MetricsMiddleware } from '../../src/middleware/metrics.middleware'
import { configureJwt, signAppToken } from '../../src/security/jwt'
import { createStructuredLogger } from '../../src/utils/logger'

class MemoryTransport extends Transport {
  readonly events: Array<Record<string, unknown>> = []

  log(info: Record<string, unknown>, next: () => void): void {
    this.events.push(info)
    next()
  }
}

const marker = { __bo2_offline_loopback: '1' }
const JWT_SECRET = 'f1-8-test-jwt-secret-with-at-least-32-characters'

test('auth regista template de rota sem URL, email ou fragmento do token', async () => {
  configureJwt({ jwtSecret: JWT_SECRET })
  const transport = new MemoryTransport()
  const logger = createStructuredLogger({ level: 'debug', transports: [transport] })
  const authenticate = createAuthenticate(logger)
  const router = express.Router()
  router.get('/by-email/:email', authenticate, (_req, res) => res.sendStatus(204))
  const app = createApp({
    authEnforce: false,
    registerRoutes: (target) => target.use('/api/users', router),
  })
  const token = signAppToken({
    id: 'admin-1',
    email: 'admin@example.test',
    role: 'admin',
    permissions: [],
  })

  await request(app)
    .get('/api/users/by-email/joao@example.test')
    .set('Authorization', `Bearer ${token}`)
    .query(marker)
    .expect(204)

  const serialized = JSON.stringify(transport.events)
  expect(serialized).not.toContain('joao@example.test')
  expect(serialized).not.toContain('admin@example.test')
  expect(serialized).not.toContain(token.slice(0, 20))
  expect(transport.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: 'Autenticação concluída',
        method: 'GET',
        route: '/users/by-email/:email',
      }),
    ]),
  )
  logger.close()
})

test('métricas guardam template em vez do email presente no path', async () => {
  const metrics = new MetricsMiddleware()
  const app = createApp({
    authEnforce: false,
    registerRoutes: (target) => {
      target.use(metrics.handler)
      target.get('/api/users/by-email/:email', (_req, res) => res.sendStatus(204))
    },
  })

  await request(app).get('/api/users/by-email/joao%40example.test').query(marker).expect(204)

  expect(metrics.getRecent(1)).toEqual([
    expect.objectContaining({ path: '/users/by-email/:email' }),
  ])
})

test('serviço Hotmart não regista fragmentos de credenciais ou tokens', () => {
  const source = fs.readFileSync(
    path.resolve(
      process.cwd(),
      'src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService.ts',
    ),
    'utf8',
  )

  expect(source).toContain("import logger from '../../../utils/logger'")
  expect(source).not.toMatch(
    /(access_token|Authorization|clientSecret|basicAuth)[^\n]*substring/gi,
  )
})
