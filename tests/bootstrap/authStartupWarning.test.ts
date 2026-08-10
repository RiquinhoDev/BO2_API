import { bootstrap } from '../../src/bootstrap'
import { MemoryStore } from 'express-rate-limit'
import type { RateLimitStoreFactory } from '../../src/security/redisRateLimitStore'

const env = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: 'f2-auth-startup-jwt-secret-at-least-32-characters',
  OLD_API_JWT_SECRET: 'f2-auth-startup-old-api-secret-at-least-32-characters',
  STUDENT_ACCESS_JWT_SECRET: 'f2-auth-startup-student-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: 'f2-auth-startup-ac-secret-at-least-32-characters',
  ALLOWED_ORIGINS: 'https://front.example',
  AUTH_ENFORCE: 'false',
  REDIS_HOST: 'redis.test',
  REDIS_PORT: '6379',
  REDIS_USERNAME: 'api',
  REDIS_PASSWORD: 'fake-redis-password',
}

test('bootstrap regista error quando auth e desligada em producao', async () => {
  const error = jest.fn()
  await bootstrap({
    env,
    log: { error },
    loadInfrastructure: async () => ({
      connectMongo: async () => undefined,
      connectRedis: async (): Promise<RateLimitStoreFactory> => () => new MemoryStore(),
      disconnect: async () => undefined,
    }),
    loadModelRegistrar: async () => async () => undefined,
    loadRouteRegistrar: async () => () => undefined,
    loadJobStarter: async () => async () => undefined,
    loadListener: async () => async () => ({ close: jest.fn() }),
  })

  expect(error).toHaveBeenCalledWith(expect.stringContaining('AUTH_ENFORCE'))
})
