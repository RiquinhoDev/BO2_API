import { loadConfig } from '../../src/config/appConfig'

test('carregar o módulo de config não valida process.env no import', () => {
  expect(loadConfig).toEqual(expect.any(Function))
})

test('loadConfig exige MONGO_URI quando é chamada', () => {
  expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('CONFIG_INVÁLIDA: MONGO_URI é obrigatória')
})

test('loadConfig valida e tipa porta e Redis explícito', () => {
  expect(
    loadConfig({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://database.internal/bo2',
      PORT: '4321',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'api',
      REDIS_PASSWORD: 'secret',
    }),
  ).toEqual({
    nodeEnv: 'production',
    mongoUri: 'mongodb://database.internal/bo2',
    port: 4321,
    redis: {
      host: 'redis.internal',
      port: 6380,
      username: 'api',
      password: 'secret',
    },
  })
})

test('loadConfig não ativa Redis localhost por omissão', () => {
  expect(loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://database.internal/bo2' }).redis).toBe(
    undefined,
  )
})
