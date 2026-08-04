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
    allowedOrigins: config.allowedOrigins,
    port: 3001,
  })
  expect(config.observability).toEqual({
    logLevel: 'info',
    metricsEnabled: false,
    logDirectory: expect.any(String),
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
  })
  expect(config.renewal.acSyncEnabled).toBe(false)
  expect(config.renewal.discordMessagesEnabled).toBe(false)
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

test('parseBoundedInteger rejects NaN, fractions, and values outside bounds', () => {
  expect(parseBoundedInteger('3', 'TEST_COUNT', { min: 1, max: 5 })).toBe(3)
  for (const value of ['NaN', '1.5', '0', '6', '']) {
    expect(() => parseBoundedInteger(value, 'TEST_COUNT', { min: 1, max: 5 })).toThrow(
      'TEST_COUNT',
    )
  }
})

test('URL helpers enforce HTTP(S) and identify the variable without echoing values', () => {
  expect(parseOptionalUrl(undefined, 'OPTIONAL_URL')).toBe(undefined)
  expect(parseOptionalUrl('https://example.test/path', 'OPTIONAL_URL')).toBe(
    'https://example.test/path',
  )
  expect(parseRequiredUrl('https://example.test', 'REQUIRED_URL')).toBe('https://example.test/')
  for (const [parser, value, name] of [
    [parseOptionalUrl, 'ftp://example.test', 'OPTIONAL_URL'],
    [parseRequiredUrl, 'not a URL', 'REQUIRED_URL'],
    [parseRequiredUrl, '', 'REQUIRED_URL'],
  ] as const) {
    expect(() => parser(value, name)).toThrow(name)
    if (value) expect(() => parser(value, name)).not.toThrow(value)
  }
})

test('parseStrongSecret rejects malformed values without exposing the secret', () => {
  const marker = 'short-secret-marker-value'

  expect(parseStrongSecret(STRONG_JWT_SECRET, 'TEST_SECRET', true)).toBe(STRONG_JWT_SECRET)
  expect(() => parseStrongSecret(marker, 'TEST_SECRET', true)).toThrow('TEST_SECRET')
  expect(() => parseStrongSecret(marker, 'TEST_SECRET', true)).not.toThrow(marker)
})

test('partial credential groups fail before an integration can be used', () => {
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      HOTMART_CLIENT_ID: 'client-id',
    }),
  ).toThrow('HOTMART_CLIENT_SECRET')
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      HOTMART_SUBDOMAIN: 'subdomain-only',
    }),
  ).toThrow('HOTMART_CLIENT_ID')
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      CURSEDUCA_API_KEY: 'api-key',
    }),
  ).toThrow('CURSEDUCA_API_URL')
})

test.each([
  [{}, false],
  [{ GROUP_FIRST: 'first', GROUP_SECOND: 'second' }, true],
] as const)('configuredCredentialGroup reports configured state without leaking values', (env, expectedConfigured) => {
  const result = configuredCredentialGroup(
    env,
    ['GROUP_FIRST', 'GROUP_SECOND'],
    (values) => ({ first: values.GROUP_FIRST, second: values.GROUP_SECOND }),
  )

  expect(result.configured).toBe(expectedConfigured)
  if (expectedConfigured) {
    expect(result).toEqual({
      configured: true,
      value: { first: 'first', second: 'second' },
    })
  }
})

test('configuredCredentialGroup rejects incomplete groups by variable name', () => {
  expect(() =>
    configuredCredentialGroup(
      { GROUP_FIRST: 'first' },
      ['GROUP_FIRST', 'GROUP_SECOND'],
      (values) => ({ first: values.GROUP_FIRST, second: values.GROUP_SECOND }),
    ),
  ).toThrow('GROUP_SECOND')
})

test('explicit malformed optional values fail even when their feature is disabled', () => {
  expect(() => loadConfig({ ...VALID_ENV, FMP_API_KEY: '   ' })).toThrow('FMP_API_KEY')
  expect(() => loadConfig({ ...VALID_ENV, SLACK_WEBHOOK_URL: 'ftp://invalid.test' })).toThrow(
    'SLACK_WEBHOOK_URL',
  )
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      DISCORD_BOT_URL: 'https://discord.example.test',
      DISCORD_MESSAGE_CHANNELS: 'not-a-channel-id:alerts',
    }),
  ).toThrow('DISCORD_MESSAGE_CHANNELS')
})

test('enabled renewal features require their complete integration group', () => {
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      RENEWAL_AC_SYNC_ENABLED: 'true',
    }),
  ).toThrow('AC_API_URL')
})

test('renewal refunds require Hotmart independently of ActiveCampaign', () => {
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      RENEWAL_AC_PROCESS_REFUNDS: 'true',
    }),
  ).toThrow('HOTMART_CLIENT_ID')

  expect(
    loadConfig({
      ...VALID_ENV,
      RENEWAL_AC_PROCESS_REFUNDS: 'true',
      HOTMART_CLIENT_ID: 'hotmart-client',
      HOTMART_CLIENT_SECRET: 'hotmart-secret',
    }).renewal.processRefundsEnabled,
  ).toBe(true)
})

test('ActiveCampaign list IDs are optional but blank supplied values fail', () => {
  const configured = loadConfig({
    ...VALID_ENV,
    AC_API_URL: 'https://ac.example.test',
    AC_API_KEY: 'ac-key',
    AC_LIST_CLAREZA: 'clareza-list',
  })

  expect(configured.integrations.activeCampaign).toEqual(
    expect.objectContaining({
      configured: true,
      value: expect.objectContaining({ lists: { clareza: 'clareza-list' } }),
    }),
  )
  expect(() =>
    loadConfig({
      ...VALID_ENV,
      AC_API_URL: 'https://ac.example.test',
      AC_API_KEY: 'ac-key',
      AC_LIST_OGI: '   ',
    }),
  ).toThrow('AC_LIST_OGI')
})

test('loadConfig rejects explicitly blank REDIS_HOST outside production', () => {
  expect(() => loadConfig({ ...VALID_ENV, REDIS_HOST: '   ' })).toThrow('REDIS_HOST')
})

test('configured optional integrations receive typed values', () => {
  const config = loadConfig({
    ...VALID_ENV,
    AC_API_URL: 'https://ac.example.test',
    AC_API_KEY: 'ac-key',
    FMP_API_KEY: 'fmp-key',
    HOTMART_CLIENT_ID: 'hotmart-client',
    HOTMART_CLIENT_SECRET: 'hotmart-secret',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    DISCORD_BOT_URL: 'https://discord.example.test',
    DISCORD_MESSAGE_CHANNELS: '123:alerts,456:general',
    STUDENT_SUMMARY_TOKEN: 'student-summary-token',
  })

  expect(config.integrations.activeCampaign).toEqual({
    configured: true,
    value: {
      apiUrl: 'https://ac.example.test/',
      apiKey: 'ac-key',
      webhookSecret: STRONG_AC_WEBHOOK_SECRET,
      lists: {},
    },
  })
  expect(config.integrations.fmp).toEqual({ configured: true, value: { apiKey: 'fmp-key' } })
  expect(config.integrations.hotmart).toEqual({
    configured: true,
    value: { clientId: 'hotmart-client', clientSecret: 'hotmart-secret' },
  })
  expect(config.integrations.discord).toEqual({
    configured: true,
    value: {
      botUrl: 'https://discord.example.test/',
      messageChannels: ['123:alerts', '456:general'],
    },
  })
  expect(config.integrations.slack).toEqual({
    configured: true,
    value: { webhookUrl: 'https://hooks.slack.test/services/test' },
  })
  expect(config.integrations.studentSummary).toEqual({
    configured: true,
    value: { token: 'student-summary-token' },
  })
})
