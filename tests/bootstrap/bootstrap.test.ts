import type { Application } from 'express'
import { MemoryStore } from 'express-rate-limit'
import { bootstrap } from '../../src/bootstrap'
import { getRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import * as loggerModule from '../../src/utils/logger'
import { createJobStarter } from '../../src/runtime/jobRuntime'
import type { RateLimitStoreFactory } from '../../src/security/redisRateLimitStore'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_OLD_API_JWT_SECRET = 'test-only-old-api-jwt-secret-at-least-32-characters'
const STRONG_STUDENT_ACCESS_JWT_SECRET = 'test-only-student-access-jwt-secret-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

beforeEach(() => {
  resetRuntimeConfigForTests()
})

afterEach(() => {
  jest.restoreAllMocks()
})

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

test('bootstrap inicializa runtime e logger antes dos componentes de runtime', async () => {
  const events: string[] = []
  const configureLogger = jest.spyOn(loggerModule, 'configureLogger').mockImplementation(config => {
    events.push('configure-logger')
    expect(config).toEqual({
      logLevel: 'info',
      metricsEnabled: false,
      logDirectory: 'logs',
      fileLoggingEnabled: false,
      consoleLoggingEnabled: false,
    })
    expect(JSON.stringify(config)).not.toContain(STRONG_JWT_SECRET)
    expect(JSON.stringify(config)).not.toContain(STRONG_AC_WEBHOOK_SECRET)
  })

  const env = {
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://database.internal/bo2',
    JWT_SECRET: STRONG_JWT_SECRET,
    OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
    STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
    AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
    PORT: '4321',
  }

  const result = await bootstrap({
    env,
    loadInfrastructure: async () => {
      events.push('load-infrastructure')
      expect(getRuntimeConfig().port).toBe(4321)
      return {
        connectMongo: async () => undefined,
        connectRedis: async () => undefined,
        disconnect: async () => undefined,
      }
    },
    loadModelRegistrar: async () => {
      events.push('load-models')
      expect(getRuntimeConfig().core.jwtSecret).toBe(STRONG_JWT_SECRET)
      return async () => undefined
    },
    loadRouteRegistrar: async () => {
      events.push('load-routes')
      expect(getRuntimeConfig().observability.logLevel).toBe('info')
      return () => undefined
    },
    loadJobStarter: async () => {
      events.push('load-jobs')
      expect(getRuntimeConfig().renewal.maxChangesPerRun).toBe(50)
      return async () => undefined
    },
    loadListener: async () => async () => ({ close: jest.fn() }),
  })

  expect(result).toEqual({ close: expect.any(Function) })
  expect(configureLogger).toHaveBeenCalledTimes(1)
  expect(events).toEqual([
    'configure-logger',
    'load-infrastructure',
    'load-models',
    'load-routes',
    'load-jobs',
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

test('bootstrap waits for warmups before infrastructure disconnect on listen rejection', async () => {
  const events: string[] = []
  const listenError = new Error('listen unavailable')
  const warmup = deferred<void>()
  const registerShutdownHandlers = jest.fn((warmupPromise?: Promise<void>) => (
    jest.fn(async () => {
      events.push('dispose-jobs')
      if (!warmupPromise) {
        await new Promise<void>(() => undefined)
      }
      await warmupPromise
    })
  ))
  const startJobs = createJobStarter({
    initializeScheduler: async () => undefined,
    ensureCronSeeds: async () => undefined,
    startSystemMonitor: () => undefined,
    startWarmups: () => warmup.promise,
    registerShutdownHandlers,
    logError: message => events.push('error:' + message),
  })
  const storeFactory = jest.fn<ReturnType<RateLimitStoreFactory>, Parameters<RateLimitStoreFactory>>(
    () => new MemoryStore(),
  )

  const bootstrapPromise = bootstrap({
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
    loadModelRegistrar: async () => async () => undefined,
    loadRouteRegistrar: async () => (_app: Application) => undefined,
    loadJobStarter: async () => startJobs,
    loadListener: async () => async () => {
      events.push('listen')
      throw listenError
    },
  })

  for (let attempt = 0; attempt < 10 && !events.includes('dispose-jobs'); attempt += 1) {
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  expect(events).toContain('dispose-jobs')
  expect(events).not.toContain('disconnect')
  expect(registerShutdownHandlers).toHaveBeenCalledWith(expect.any(Promise))

  warmup.resolve()
  await expect(bootstrapPromise).rejects.toBe(listenError)
  expect(events).toContain('disconnect')
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
