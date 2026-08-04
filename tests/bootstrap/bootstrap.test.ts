import type { Application } from 'express'
import { MemoryStore } from 'express-rate-limit'
import { bootstrap } from '../../src/bootstrap'
import type { RateLimitStoreFactory } from '../../src/security/redisRateLimitStore'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_OLD_API_JWT_SECRET = 'test-only-old-api-jwt-secret-at-least-32-characters'
const STRONG_STUDENT_ACCESS_JWT_SECRET = 'test-only-student-access-jwt-secret-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

test('bootstrap falha na config antes de carregar infraestrutura', async () => {
  const loadInfrastructure = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      },
      loadInfrastructure,
    }),
  ).rejects.toThrow('MONGO_URI')
  expect(loadInfrastructure).not.toHaveBeenCalled()
})

test('bootstrap aborta sem JWT_SECRET antes de carregar infraestrutura', async () => {
  const loadInfrastructure = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      },
      loadInfrastructure,
    }),
  ).rejects.toThrow('JWT_SECRET')
  expect(loadInfrastructure).not.toHaveBeenCalled()
})

test('bootstrap respeita config -> infra -> modelos -> rotas -> jobs -> listen', async () => {
  const events: string[] = []
  const server = { close: jest.fn() }
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => new MemoryStore(),
  )

  const result = await bootstrap({
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
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
          return storeFactory
        },
        disconnect: async () => {
          events.push('disconnect')
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
  expect(storeFactory).toHaveBeenCalledWith('login')
  expect(storeFactory).toHaveBeenCalledWith('webhook')
  expect(storeFactory).toHaveBeenCalledWith('heavy')
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
test('bootstrap production aborta sem Redis antes de registar rotas ou listener', async () => {
  const loadInfrastructure = jest.fn()
  const loadRouteRegistrar = jest.fn()
  const loadListener = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
        ALLOWED_ORIGINS: 'https://front.example',
      },
      loadInfrastructure,
      loadRouteRegistrar,
      loadListener,
    }),
  ).rejects.toThrow('REDIS_HOST')

  expect(loadInfrastructure).not.toHaveBeenCalled()
  expect(loadRouteRegistrar).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
})
test('bootstrap limpa infraestrutura quando Redis falha antes de rotas e listener', async () => {
  const events: string[] = []
  const redisError = new Error('redis unavailable')
  const loadModelRegistrar = jest.fn()
  const loadRouteRegistrar = jest.fn()
  const loadJobStarter = jest.fn()
  const loadListener = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
        ALLOWED_ORIGINS: 'https://front.example',
        REDIS_HOST: 'redis.test',
        REDIS_PORT: '6379',
        REDIS_USERNAME: 'api',
        REDIS_PASSWORD: 'fake-redis-password',
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { events.push('mongo') },
        connectRedis: async () => {
          events.push('redis')
          throw redisError
        },
        disconnect: async () => {
          events.push('disconnect')
        },
      }),
      loadModelRegistrar,
      loadRouteRegistrar,
      loadJobStarter,
      loadListener,
    }),
  ).rejects.toBe(redisError)

  expect(events).toEqual(['mongo', 'redis', 'disconnect'])
  expect(loadModelRegistrar).not.toHaveBeenCalled()
  expect(loadRouteRegistrar).not.toHaveBeenCalled()
  expect(loadJobStarter).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
})

test('bootstrap limpa infraestrutura quando factory Redis de producao falta', async () => {
  const events: string[] = []
  const loadModelRegistrar = jest.fn()
  const loadRouteRegistrar = jest.fn()
  const loadJobStarter = jest.fn()
  const loadListener = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
        ALLOWED_ORIGINS: 'https://front.example',
        REDIS_HOST: 'redis.test',
        REDIS_PORT: '6379',
        REDIS_USERNAME: 'api',
        REDIS_PASSWORD: 'fake-redis-password',
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { events.push('mongo') },
        connectRedis: async () => { events.push('redis'); return undefined },
        disconnect: async () => {
          events.push('disconnect')
        },
      }),
      loadModelRegistrar,
      loadRouteRegistrar,
      loadJobStarter,
      loadListener,
    }),
  ).rejects.toThrow('store factory')

  expect(events).toEqual(['mongo', 'redis', 'disconnect'])
  expect(loadModelRegistrar).not.toHaveBeenCalled()
  expect(loadRouteRegistrar).not.toHaveBeenCalled()
  expect(loadJobStarter).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
})

test('bootstrap limpa infraestrutura quando Mongo falha e relanca o erro original', async () => {
  const events: string[] = []
  const mongoError = new Error('mongo unavailable')
  const loadInfrastructure = jest.fn(async () => ({
    connectMongo: async () => {
      events.push('mongo')
      throw mongoError
    },
    connectRedis: async () => {
      events.push('redis')
      return undefined
    },
    disconnect: async () => { events.push('disconnect') },
  }))
  const loadRouteRegistrar = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      },
      loadInfrastructure,
      loadRouteRegistrar,
    }),
  ).rejects.toBe(mongoError)

  expect(events).toEqual(['mongo', 'disconnect'])
  expect(loadRouteRegistrar).not.toHaveBeenCalled()
})

test('bootstrap limpa infraestrutura quando carregamento dos modelos falha', async () => {
  const events: string[] = []
  const modelError = new Error('model loader unavailable')
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => new MemoryStore(),
  )
  const loadModelRegistrar = jest.fn(async () => {
    events.push('load-models')
    throw modelError
  })
  const loadRouteRegistrar = jest.fn()
  const loadJobStarter = jest.fn()
  const loadListener = jest.fn()

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { events.push('mongo') },
        connectRedis: async () => {
          events.push('redis')
          return storeFactory
        },
        disconnect: async () => { events.push('disconnect') },
      }),
      loadModelRegistrar,
      loadRouteRegistrar,
      loadJobStarter,
      loadListener,
    }),
  ).rejects.toBe(modelError)

  expect(events).toEqual(['mongo', 'redis', 'load-models', 'disconnect'])
  expect(loadRouteRegistrar).not.toHaveBeenCalled()
  expect(loadJobStarter).not.toHaveBeenCalled()
  expect(loadListener).not.toHaveBeenCalled()
})

test('bootstrap limpa infraestrutura quando listen falha depois de iniciar jobs', async () => {
  const events: string[] = []
  const listenError = new Error('listen unavailable')
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => new MemoryStore(),
  )

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { events.push('mongo') },
        connectRedis: async () => {
          events.push('redis')
          return storeFactory
        },
        disconnect: async () => { events.push('disconnect') },
      }),
      loadModelRegistrar: async () => async () => {
        events.push('register-models')
      },
      loadRouteRegistrar: async () => (app: Application) => {
        events.push('register-routes')
        app.get('/health', (_req, res) => res.sendStatus(204))
      },
      loadJobStarter: async () => async () => {
        events.push('start-jobs')
      },
      loadListener: async () => async () => {
        events.push('listen')
        throw listenError
      },
    }),
  ).rejects.toBe(listenError)

  expect(events).toEqual([
    'mongo',
    'redis',
    'register-models',
    'register-routes',
    'start-jobs',
    'listen',
    'disconnect',
  ])
})

test('bootstrap preserva erro de arranque quando cleanup falha', async () => {
  const startupError = new Error('startup unavailable')
  const cleanupError = new Error('cleanup unavailable')
  const log = { error: jest.fn() }

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { throw startupError },
        connectRedis: async () => new MemoryStore() as unknown as RateLimitStoreFactory,
        disconnect: async () => { throw cleanupError },
      }),
      log,
    }),
  ).rejects.toBe(startupError)

  expect(log.error).toHaveBeenCalledWith(expect.stringContaining('limpar infraestrutura'), cleanupError)
})

test('bootstrap disposes jobs before infrastructure on listen rejection', async () => {
  const events: string[] = []
  const listenError = new Error('listen unavailable')
  const disposeJobs = jest.fn(async () => { events.push('dispose-jobs') })
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => new MemoryStore(),
  )

  await expect(
    bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://database.internal/bo2',
        JWT_SECRET: STRONG_JWT_SECRET,
        OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
        STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
        AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      },
      loadInfrastructure: async () => ({
        connectMongo: async () => { events.push('mongo') },
        connectRedis: async () => storeFactory,
        disconnect: async () => { events.push('disconnect') },
      }),
      loadModelRegistrar: async () => async () => { events.push('register-models') },
      loadRouteRegistrar: async () => (app: Application) => {
        events.push('register-routes')
        app.get('/health', (_req, res) => res.sendStatus(204))
      },
      loadJobStarter: async () => async () => {
        events.push('start-jobs')
        return disposeJobs
      },
      loadListener: async () => async () => {
        events.push('listen')
        throw listenError
      },
    }),
  ).rejects.toBe(listenError)

  expect(events).toEqual([
    'mongo',
    'register-models',
    'register-routes',
    'start-jobs',
    'listen',
    'dispose-jobs',
    'disconnect',
  ])
  expect(disposeJobs).toHaveBeenCalledTimes(1)
  expect(disposeJobs).toHaveBeenCalledWith({ stopCache: false })
})
