import { bootstrap } from '../../src/bootstrap'

const env = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: 'f2-auth-startup-jwt-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: 'f2-auth-startup-ac-secret-at-least-32-characters',
  AUTH_ENFORCE: 'false',
}

test('bootstrap regista error quando auth e desligada em producao', async () => {
  const error = jest.fn()
  await bootstrap({
    env,
    log: { error },
    loadInfrastructure: async () => ({
      connectMongo: async () => undefined,
      connectRedis: async () => undefined,
    }),
    loadModelRegistrar: async () => async () => undefined,
    loadRouteRegistrar: async () => () => undefined,
    loadJobStarter: async () => async () => undefined,
    loadListener: async () => async () => ({ close: jest.fn() }),
  })

  expect(error).toHaveBeenCalledWith(expect.stringContaining('AUTH_ENFORCE'))
})
