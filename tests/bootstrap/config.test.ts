import { loadConfig } from '../../src/config/appConfig'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'

test('carregar o modulo de config nao valida process.env no import', () => {
  expect(loadConfig).toEqual(expect.any(Function))
})

test('loadConfig exige MONGO_URI quando e chamada', () => {
  expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('MONGO_URI')
})

test('loadConfig exige JWT_SECRET forte no bootstrap', () => {
  expect(() =>
    loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://database.internal/bo2' }),
  ).toThrow('JWT_SECRET')

  expect(() =>
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: 'curto',
    }),
  ).toThrow('JWT_SECRET deve ter pelo menos 32 caracteres')
})

test('loadConfig valida e tipa porta, JWT e Redis explicito', () => {
  expect(
    loadConfig({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: 'old-api-test-secret-with-at-least-32-characters',
      PORT: '4321',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'api',
      REDIS_PASSWORD: 'secret',
    }),
  ).toEqual({
    nodeEnv: 'production',
    mongoUri: 'mongodb://database.internal/bo2',
    jwtSecret: STRONG_JWT_SECRET,
    oldApiJwtSecret: 'old-api-test-secret-with-at-least-32-characters',
    port: 4321,
    redis: {
      host: 'redis.internal',
      port: 6380,
      username: 'api',
      password: 'secret',
    },
  })
})

test('loadConfig nao ativa Redis localhost por omissao', () => {
  expect(
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
    }).redis,
  ).toBe(undefined)
})
