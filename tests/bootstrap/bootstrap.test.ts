import type { Application } from 'express'
import { bootstrap } from '../../src/bootstrap'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

test('bootstrap falha na config antes de carregar infraestrutura', async () => {
  const loadInfrastructure = jest.fn()

  await expect(
    bootstrap({ env: { NODE_ENV: 'test' }, loadInfrastructure }),
  ).rejects.toThrow('MONGO_URI')
  expect(loadInfrastructure).not.toHaveBeenCalled()
})

test('bootstrap aborta sem JWT_SECRET antes de carregar infraestrutura', async () => {
  const loadInfrastructure = jest.fn()

  await expect(
    bootstrap({
      env: { NODE_ENV: 'test', MONGO_URI: 'mongodb://database.internal/bo2' },
      loadInfrastructure,
    }),
  ).rejects.toThrow('JWT_SECRET')
  expect(loadInfrastructure).not.toHaveBeenCalled()
})

test('bootstrap respeita config -> infra -> modelos -> rotas -> jobs -> listen', async () => {
  const events: string[] = []
  const server = { close: jest.fn() }

  const result = await bootstrap({
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      PORT: '4321',
    },
    loadInfrastructure: async () => {
      events.push('load-infrastructure')
      return {
        connectMongo: async () => {
          events.push('connect-mongo')
        },
        connectRedis: async () => {
          events.push('connect-redis')
        },
      }
    },
    loadModelRegistrar: async () => {
      events.push('load-models')
      return async () => {
        events.push('register-models')
      }
    },
    loadRouteRegistrar: async () => {
      events.push('load-routes')
      return (app: Application) => {
        events.push('register-routes')
        app.get('/health', (_req, res) => res.sendStatus(204))
      }
    },
    loadJobStarter: async () => {
      events.push('load-jobs')
      return async () => {
        events.push('start-jobs')
      }
    },
    loadListener: async () => {
      events.push('load-listener')
      return async (_app, port) => {
        events.push(`listen:${port}`)
        return server
      }
    },
  })

  expect(result).toBe(server)
  expect(events).toEqual([
    'load-infrastructure',
    'connect-mongo',
    'connect-redis',
    'load-models',
    'register-models',
    'load-routes',
    'register-routes',
    'load-jobs',
    'start-jobs',
    'load-listener',
    'listen:4321',
  ])
})
