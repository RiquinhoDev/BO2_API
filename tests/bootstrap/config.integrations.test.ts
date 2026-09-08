import {
  configuredCredentialGroup,
  loadConfig,
  parseBoundedInteger,
  parseOptionalUrl,
  parseRequiredUrl,
  parseStrongSecret,
} from '../../src/config/appConfig'

const STRONG_JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters'
const STRONG_AC_WEBHOOK_SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'

const VALID_ENV = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: STRONG_JWT_SECRET,
  OLD_API_JWT_SECRET: 'test-only-old-api-jwt-secret-at-least-32-characters',
  STUDENT_ACCESS_JWT_SECRET: 'test-only-student-access-jwt-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: STRONG_AC_WEBHOOK_SECRET,
}

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

test('CursEduca inactivation switch is false by default and requires complete credentials when enabled', () => {
  expect(loadConfig(VALID_ENV).integrations.curseduca).toEqual({ configured: false })

  expect(() => loadConfig({
    ...VALID_ENV,
    CURSEDUCA_INACTIVATION_ENABLED: 'true',
  })).toThrow('CURSEDUCA_INACTIVATION_ENABLED')

  expect(loadConfig({
    ...VALID_ENV,
    CURSEDUCA_API_URL: 'https://curseduca.example.test',
    CURSEDUCA_API_KEY: 'curseduca-api-key',
    CURSEDUCA_AccessToken: 'curseduca-access-token',
    CURSEDUCA_INACTIVATION_ENABLED: 'true',
  }).integrations.curseduca).toEqual({
    configured: true,
    value: {
      apiUrl: 'https://curseduca.example.test/',
      apiKey: 'curseduca-api-key',
      accessToken: 'curseduca-access-token',
      inactivationEnabled: true,
    },
  })
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
  expect(() => loadConfig({ ...VALID_ENV, AC_DEBUG: 'TRUE' })).toThrow('AC_DEBUG')
  expect(() => loadConfig({ ...VALID_ENV, AC_DEBUG_VERIFY_DELETE: 'yes' })).toThrow('AC_DEBUG_VERIFY_DELETE')

  expect(() => loadConfig({ ...VALID_ENV, FMP_API_KEY: '   ' })).toThrow('FMP_API_KEY')
  expect(() => loadConfig({ ...VALID_ENV, CLAREZA_REFRESH_TOKEN: '   ' })).toThrow(
    'CLAREZA_REFRESH_TOKEN',
  )
  expect(() => loadConfig({ ...VALID_ENV, OLD_API_URL: 'ftp://invalid.test' })).toThrow(
    'OLD_API_URL',
  )
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

test('Hotmart aliases are normalized once with explicit priority and no default subdomain', () => {
  const config = loadConfig({
    ...VALID_ENV,
    HOTMART_CLIENT_ID: 'hotmart-client',
    HOTMART_CLIENT_SECRET: 'hotmart-secret',
    HOTMART_SUBDOMAIN: 'canonical-subdomain',
    COURSE_LESSON_SUBDOMAIN: 'lesson-subdomain',
    COURSE_LESSON_SYNC_USER_ID: 'sync-user',
    subdomain: 'legacy-subdomain',
  })

  expect(config.integrations.hotmart).toEqual({
    configured: true,
    value: {
      clientId: 'hotmart-client',
      clientSecret: 'hotmart-secret',
      subdomain: 'lesson-subdomain',
      syncUserId: 'sync-user',
    },
  })

  expect(
    loadConfig({
      ...VALID_ENV,
      HOTMART_CLIENT_ID: 'hotmart-client',
      HOTMART_CLIENT_SECRET: 'hotmart-secret',
    }).integrations.hotmart,
  ).toEqual({
    configured: true,
    value: {
      clientId: 'hotmart-client',
      clientSecret: 'hotmart-secret',
    },
  })
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
test('renewal settings are parsed once into the typed startup boundary', () => {
  const config = loadConfig({
    ...VALID_ENV,
    RENEWAL_AC_SYNC_ENABLED: 'true',
    RENEWAL_AC_WRITE_DATES: 'true',
    RENEWAL_AC_WRITE_TAGS: 'true',
    RENEWAL_AC_PROCESS_REFUNDS: 'true',
    RENEWAL_AC_AUTO_EXECUTE: 'true',
    RENEWAL_AC_EXPIRY_FIELD_ID: '777',
    RENEWAL_AC_MAX_CHANGES_PER_RUN: '42',
    AC_API_URL: 'https://ac.example.test',
    AC_API_KEY: 'ac-key',
    HOTMART_CLIENT_ID: 'hotmart-client',
    HOTMART_CLIENT_SECRET: 'hotmart-secret',
    HOTMART_OGI_PRODUCT_ID: 'ogi-product',
    DISCORD_ROLES_SYNC_ENABLED: 'true',
    DISCORD_ROLES_AUTO_EXECUTE: 'true',
    DISCORD_MESSAGES_ENABLED: 'true',
    DISCORD_SCHEDULED_MESSAGES_ENABLED: 'true',
    DISCORD_ROLES_MAX_OPS_PER_RUN: '25',
    DISCORD_BOT_URL: 'https://discord.example.test',
    BOT_SHARED_SECRET: 'bot-secret',
    DISCORD_MESSAGE_CHANNEL_ID: '123456789012345678',
    DISCORD_MESSAGE_CHANNELS: '123456789012345678:alerts',
  })

  expect(config.renewal).toEqual({
    acFirstPurchaseDateFieldId: 337,
    acPurchaseStatusFieldId: 282,
    acRefundDateFieldId: 324,
    ogiProductFamilyIds: ['1733154', '3100292', '4346330'],
    ogiNewStudentPriceThresholdEur: 167,
    guruClarezaMonthlyProductId: '',
    guruClarezaAnnualProductId: '',
    fxRatesToEur: { USD: 0.92, GBP: 1.17, CHF: 1.05, CAD: 0.68, BRL: 0.16 },
    acSyncEnabled: true,
    manualExecutionEnabled: false,
    offerManualExecutionEnabled: false,
    writeDatesEnabled: true,
    writeTagsEnabled: true,
    processRefundsEnabled: true,
    autoExecute: true,
    expiryFieldId: 777,
    maxChangesPerRun: 42,
    hotmartOgiProductId: 'ogi-product',
    discordRolesSyncEnabled: true,
    discordRolesAutoExecute: true,
    discordRolesManualExecutionEnabled: false,
    discordMessagesEnabled: true,
    discordScheduledMessagesEnabled: true,
    discordRolesMaxOpsPerRun: 25,
    discordMessageChannelId: '123456789012345678',
    discordMessageChannels: ['123456789012345678:alerts'],
  })
})

test('renewal has no implicit production Discord destination', () => {
  const config = loadConfig(VALID_ENV)

  expect(config.integrations.discord).toEqual({ configured: false })
  expect(config.renewal.discordMessageChannelId).toBeUndefined()
  expect(config.renewal.discordMessageChannels).toEqual([])

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

test('ActiveCampaign tag mutations stay disabled by default and require complete credentials when enabled', () => {
  expect(loadConfig(VALID_ENV).integrations.activeCampaign).toEqual({ configured: false })

  expect(() => loadConfig({
    ...VALID_ENV,
    AC_TAG_APPLY_ENABLED: 'true',
  })).toThrow('AC_TAG_APPLY_ENABLED')

  expect(loadConfig({
    ...VALID_ENV,
    AC_API_URL: 'https://ac.example.test',
    AC_API_KEY: 'ac-key',
    AC_TAG_APPLY_ENABLED: 'true',
  }).integrations.activeCampaign).toEqual(expect.objectContaining({
    configured: true,
    value: expect.objectContaining({ tagApplyEnabled: true }),
  }))
})

test('loadConfig rejects explicitly blank REDIS_HOST outside production', () => {
  expect(() => loadConfig({ ...VALID_ENV, REDIS_HOST: '   ' })).toThrow('REDIS_HOST')
})

test('configured optional integrations receive typed values', () => {
  const config = loadConfig({
    ...VALID_ENV,
    AC_API_URL: 'https://ac.example.test',
    AC_API_KEY: 'ac-key',
    AC_DEBUG: 'true',
    AC_DEBUG_VERIFY_DELETE: 'true',
    FMP_API_KEY: 'fmp-key',
    HOTMART_CLIENT_ID: 'hotmart-client',
    HOTMART_CLIENT_SECRET: 'hotmart-secret',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    DISCORD_BOT_URL: 'https://discord.example.test',
    DISCORD_MESSAGE_CHANNELS: '123:alerts,456:general',
    STUDENT_SUMMARY_TOKEN: 'student-summary-token',
    CLAREZA_REFRESH_TOKEN: 'clareza-refresh-token',
    OLD_API_URL: 'https://legacy.example.test',
  })

  expect(config.integrations.activeCampaign).toEqual({
    configured: true,
    value: {
      apiUrl: 'https://ac.example.test/',
      apiKey: 'ac-key',
      webhookSecret: STRONG_AC_WEBHOOK_SECRET,
      debugEnabled: true,
      verifyDeleteEnabled: true,
      tagApplyEnabled: false,
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
  expect(config.integrations.clareza).toEqual({
    configured: true,
    value: { refreshToken: 'clareza-refresh-token' },
  })
  expect(config.integrations.legacyApi).toEqual({
    configured: true,
    value: { apiUrl: 'https://legacy.example.test/' },
  })
})
