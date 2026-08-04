import { loadConfig } from '../../src/config/appConfig'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_OLD_API_JWT_SECRET = 'test-only-old-api-jwt-secret-at-least-32-characters'
const STRONG_STUDENT_ACCESS_JWT_SECRET = 'test-only-student-access-jwt-secret-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

const VALID_ENV = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: STRONG_JWT_SECRET,
  OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
  STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
  AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
}

const DUPLICATE_SECRET_CASES = [
  {
    name: 'JWT_SECRET e OLD_API_JWT_SECRET',
    env: { JWT_SECRET: STRONG_OLD_API_JWT_SECRET },
    expected: 'JWT_SECRET.*OLD_API_JWT_SECRET',
  },
  {
    name: 'JWT_SECRET e STUDENT_ACCESS_JWT_SECRET',
    env: { JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET },
    expected: 'JWT_SECRET.*STUDENT_ACCESS_JWT_SECRET',
  },
  {
    name: 'OLD_API_JWT_SECRET e STUDENT_ACCESS_JWT_SECRET',
    env: { OLD_API_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET },
    expected: 'OLD_API_JWT_SECRET.*STUDENT_ACCESS_JWT_SECRET',
  },
] as const

test('carregar o modulo de config nao valida process.env no import', () => {
  expect(loadConfig).toEqual(expect.any(Function))
})

test('loadConfig exige MONGO_URI quando e chamada', () => {
  expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('MONGO_URI')
})

test('loadConfig exige JWT_SECRET forte no bootstrap', () => {
  expect(() =>
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
    }),
  ).toThrow('JWT_SECRET')

  expect(() =>
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: 'curto',
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
    }),
  ).toThrow('JWT_SECRET deve ter pelo menos 32 caracteres')
})

test('loadConfig exige segredos dedicados fortes para API antiga e acesso estudante', () => {
  expect(() => loadConfig({ ...VALID_ENV, OLD_API_JWT_SECRET: undefined })).toThrow('OLD_API_JWT_SECRET')
  expect(() => loadConfig({ ...VALID_ENV, STUDENT_ACCESS_JWT_SECRET: 'curto' })).toThrow(
    'STUDENT_ACCESS_JWT_SECRET deve ter pelo menos 32 caracteres',
  )
})

test.each(DUPLICATE_SECRET_CASES)('$name rejeita autoridades JWT duplicadas', ({ env, expected }) => {
  expect(() => loadConfig({ ...VALID_ENV, ...env })).toThrow(new RegExp(expected))
})

test('loadConfig exige segredo forte para assinar webhooks AC', () => {
  expect(() =>
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
    }),
  ).toThrow('AC_WEBHOOK_SECRET')
})

test('loadConfig valida e tipa porta, JWT e Redis explicito', () => {
  expect(
    loadConfig({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      ALLOWED_ORIGINS: 'https://extra.example/app',
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
    oldApiJwtSecret: STRONG_OLD_API_JWT_SECRET,
    studentAccessJwtSecret: STRONG_STUDENT_ACCESS_JWT_SECRET,
    acWebhookSecret: STRONG_AC_WEBHOOK_SECRET,
    authEnforce: true,
    enableDebugRoutes: false,
    allowedOrigins: expect.arrayContaining([
      'https://extra.example',
      'https://backoffice.serriquinho.com',
      'http://localhost:3000',
    ]),
    port: 4321,
    redis: {
      host: 'redis.internal',
      port: 6380,
      username: 'api',
      password: 'secret',
    },
  })
})

test('debug routes exigem flag explicita e sao proibidas em producao', () => {
  expect(
    loadConfig({
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      ENABLE_DEBUG_ROUTES: 'true',
    }).enableDebugRoutes,
  ).toBe(true)

  expect(() =>
    loadConfig({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
      ENABLE_DEBUG_ROUTES: 'true',
    }),
  ).toThrow('ENABLE_DEBUG_ROUTES')
})

test('loadConfig nao ativa Redis localhost por omissao', () => {
  expect(
    loadConfig({
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://database.internal/bo2',
      JWT_SECRET: STRONG_JWT_SECRET,
      OLD_API_JWT_SECRET: STRONG_OLD_API_JWT_SECRET,
      STUDENT_ACCESS_JWT_SECRET: STRONG_STUDENT_ACCESS_JWT_SECRET,
      AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
    }).redis,
  ).toBe(undefined)
})
