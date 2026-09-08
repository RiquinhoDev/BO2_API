import {
  configuredCredentialGroup,
  loadConfig,
  parseBooleanFlag,
  parseBoundedInteger,
  parseOptionalUrl,
  parseRequiredUrl,
  parseStrongSecret,
} from '../../src/config/appConfig'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_OLD_API_JWT_SECRET = 'test-only-old-api-jwt-secret-at-least-32-characters'
const STRONG_STUDENT_ACCESS_JWT_SECRET = 'test-only-student-access-jwt-secret-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

const FAKE_REDIS_ENV = {
  REDIS_HOST: 'redis.test',
  REDIS_PORT: '6379',
  REDIS_USERNAME: 'api',
  REDIS_PASSWORD: 'fake-redis-password',
}

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

test('loadConfig exige ALLOWED_ORIGINS explicita em producao', () => {
  for (const value of [undefined, '', '   ', ',']) {
    expect(() =>
      loadConfig({ ...VALID_ENV, ...FAKE_REDIS_ENV, NODE_ENV: 'production', ALLOWED_ORIGINS: value }),
    ).toThrow('ALLOWED_ORIGINS')
  }
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
  ).toEqual(expect.objectContaining({
    nodeEnv: 'production',
    mongoUri: 'mongodb://database.internal/bo2',
    jwtSecret: STRONG_JWT_SECRET,
    oldApiJwtSecret: STRONG_OLD_API_JWT_SECRET,
    studentAccessJwtSecret: STRONG_STUDENT_ACCESS_JWT_SECRET,
    acWebhookSecret: STRONG_AC_WEBHOOK_SECRET,
    authEnforce: true,
    enableDebugRoutes: false,
    guruTrialManualExecutionEnabled: false,
    allowedOrigins: ['https://extra.example'],
    port: 4321,
    redis: {
      host: 'redis.internal',
      port: 6380,
      username: 'api',
      password: 'secret',
    },
  }))
})

test('Guru manual execution is typed, disabled by default, and strict when supplied', () => {
  const config = loadConfig(VALID_ENV)
  expect(config.core.guruTrialManualExecutionEnabled).toBe(false)

  expect(loadConfig({
    ...VALID_ENV,
    GURU_TRIAL_MANUAL_EXECUTION_ENABLED: 'true',
    GURU_USER_TOKEN: 'guru-user-token',
    GURU_ACCOUNT_TOKEN: 'guru-account-token',
  }).core.guruTrialManualExecutionEnabled)
    .toBe(true)

  expect(() => loadConfig({ ...VALID_ENV, GURU_TRIAL_MANUAL_EXECUTION_ENABLED: 'true' }))
    .toThrow('GURU_TRIAL_MANUAL_EXECUTION_ENABLED requer credenciais Guru completas')

  expect(() => loadConfig({ ...VALID_ENV, GURU_TRIAL_MANUAL_EXECUTION_ENABLED: 'yes' }))
    .toThrow('GURU_TRIAL_MANUAL_EXECUTION_ENABLED deve ser true ou false')
})

test('loadConfig preserva defaults loopback apenas fora de producao', () => {
  expect(loadConfig(VALID_ENV).allowedOrigins).toEqual(
    expect.arrayContaining(['http://localhost:3000', 'http://127.0.0.1:5173']),
  )
  expect(loadConfig(VALID_ENV).allowedOrigins).not.toContain('https://backoffice.serriquinho.com')
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
      ALLOWED_ORIGINS: 'https://front.example',
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
      ALLOWED_ORIGINS: 'https://front.example',
      ENABLE_DEBUG_ROUTES: 'true',
      ...FAKE_REDIS_ENV,
    }),
  ).toThrow('ENABLE_DEBUG_ROUTES')
})

test('execução mutável dos composites fica desligada por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).core.syncMutableExecutionEnabled).toBe(false)
  expect(loadConfig({ ...VALID_ENV, SYNC_MUTABLE_EXECUTION_ENABLED: 'true' }).core.syncMutableExecutionEnabled)
    .toBe(true)
})

test('limpeza de execuções CRON fica desligada por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).core.cronExecutionCleanupMutableExecutionEnabled).toBe(false)
  expect(loadConfig({ ...VALID_ENV, CRON_EXECUTION_CLEANUP_MUTABLE_EXECUTION_ENABLED: 'true' }).core.cronExecutionCleanupMutableExecutionEnabled)
    .toBe(true)
})

test('avaliação mutável de conquistas fica desligada por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).core.achievementEvaluationMutableExecutionEnabled).toBe(false)
  expect(loadConfig({ ...VALID_ENV, ACHIEVEMENT_EVALUATION_MUTABLE_EXECUTION_ENABLED: 'true' }).core.achievementEvaluationMutableExecutionEnabled)
    .toBe(true)
})

test('snapshot semanal mutável fica desligado por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).core.weeklyTagSnapshotMutableExecutionEnabled).toBe(false)
  expect(loadConfig({ ...VALID_ENV, WEEKLY_TAG_SNAPSHOT_MUTABLE_EXECUTION_ENABLED: 'true' }).core.weeklyTagSnapshotMutableExecutionEnabled)
    .toBe(true)
})

test('execução mutável manual de Renewal AC fica desligada por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).renewal.manualExecutionEnabled).toBe(false)
  expect(loadConfig({ ...VALID_ENV, RENEWAL_AC_MANUAL_EXECUTION_ENABLED: 'true' }).renewal.manualExecutionEnabled)
    .toBe(true)
})

test('execução manual de RenewalOffer fica desligada por omissão e exige Hotmart completa', () => {
  expect(loadConfig(VALID_ENV).renewal.offerManualExecutionEnabled).toBe(false)
  expect(loadConfig({
    ...VALID_ENV,
    RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED: 'true',
    HOTMART_CLIENT_ID: 'hotmart-client',
    HOTMART_CLIENT_SECRET: 'hotmart-secret',
  }).renewal.offerManualExecutionEnabled).toBe(true)

  expect(() => loadConfig({
    ...VALID_ENV,
    RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED: 'true',
  })).toThrow('RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED requer credenciais Hotmart completas')

  expect(() => loadConfig({
    ...VALID_ENV,
    RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED: 'yes',
  })).toThrow('RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED deve ser true ou false')
})

test('execução mutável manual de DiscordRoles fica desligada por omissão e exige flag tipada', () => {
  expect(loadConfig(VALID_ENV).renewal.discordRolesManualExecutionEnabled).toBe(false)
  expect(loadConfig({
    ...VALID_ENV,
    DISCORD_BOT_URL: 'https://discord.example.test',
    BOT_SHARED_SECRET: 'bot-secret',
    DISCORD_ROLES_MANUAL_EXECUTION_ENABLED: 'true',
  }).renewal.discordRolesManualExecutionEnabled)
    .toBe(true)
})

test('execução manual de DiscordRoles exige integração Discord configurada', () => {
  expect(() => loadConfig({
    ...VALID_ENV,
    DISCORD_ROLES_MANUAL_EXECUTION_ENABLED: 'true',
  })).toThrow('DISCORD_BOT_URL')
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
test('loadConfig exige REDIS_HOST em producao para rate limiting distribuido', () => {
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://front.example',
    }),
  ).toThrow('CONFIG_INVALIDA: REDIS_HOST e obrigatoria em producao para rate limiting distribuido')
})
test('loadConfig expande secoes focadas e deixa integracoes opcionais inertes', () => {
  const config = loadConfig(VALID_ENV)

  expect(config.core).toEqual({
    nodeEnv: 'test',
    mongoUri: VALID_ENV.MONGO_URI,
    jwtSecret: STRONG_JWT_SECRET,
    oldApiJwtSecret: STRONG_OLD_API_JWT_SECRET,
    studentAccessJwtSecret: STRONG_STUDENT_ACCESS_JWT_SECRET,
    acWebhookSecret: STRONG_AC_WEBHOOK_SECRET,
    authEnforce: true,
    enableDebugRoutes: false,
    syncMutableExecutionEnabled: false,
    cronExecutionCleanupMutableExecutionEnabled: false,
    achievementEvaluationMutableExecutionEnabled: false,
    guruTrialManualExecutionEnabled: false,
    hotmartSyncManualExecutionEnabled: false,
    curseducaSyncManualExecutionEnabled: false,
    allSyncManualExecutionEnabled: false,
    weeklyTagSnapshotMutableExecutionEnabled: false,
    allowedOrigins: config.allowedOrigins,
    port: 3001,
  })
  expect(config.observability).toEqual({
    logLevel: 'info',
    metricsEnabled: false,
    logDirectory: expect.any(String),
    fileLoggingEnabled: false,
    consoleLoggingEnabled: false,
  })
  expect(config.integrations).toEqual({
    activeCampaign: { configured: false },
    fmp: { configured: false },
    hotmart: { configured: false },
    curseduca: { configured: false },
    guru: { configured: false },
    discord: { configured: false },
    slack: { configured: false },
    studentSummary: { configured: false },
    clareza: { configured: false },
    legacyApi: { configured: false },
  })
  expect(config.renewal.acSyncEnabled).toBe(false)
  expect(config.renewal.discordMessagesEnabled).toBe(false)
})

test.each([
  ['test', false, false],
  ['development', true, true],
  ['production', true, false],
] as const)('loadConfig derives logger transports for %s', (nodeEnv, fileLoggingEnabled, consoleLoggingEnabled) => {
  const config = loadConfig({
    ...VALID_ENV,
    NODE_ENV: nodeEnv,
    ...(nodeEnv === 'production' ? { ALLOWED_ORIGINS: 'https://front.example', ...FAKE_REDIS_ENV } : {}),
  })

  expect(config.observability.fileLoggingEnabled).toBe(fileLoggingEnabled)
  expect(config.observability.consoleLoggingEnabled).toBe(consoleLoggingEnabled)
})

test.each([
  ['true', true],
  ['false', false],
] as const)('parseBooleanFlag accepts only canonical value %s', (value, expected) => {
  expect(parseBooleanFlag(value, 'TEST_FLAG')).toBe(expected)
})

test.each(['TRUE', 'yes', '1', ''])('parseBooleanFlag rejects malformed value %s', (value) => {
  expect(() => parseBooleanFlag(value, 'TEST_FLAG')).toThrow('TEST_FLAG')
})
