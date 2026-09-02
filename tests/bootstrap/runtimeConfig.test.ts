import type { AppConfig } from '../../src/config/configTypes'
import {
  getRuntimeConfig,
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'

const runtimeConfig = (): AppConfig =>
  ({
    nodeEnv: 'test',
    mongoUri: 'mongodb://database.internal/bo2',
    jwtSecret: 'test-only-jwt-secret-with-at-least-32-characters',
    oldApiJwtSecret: 'test-only-old-api-jwt-secret-at-least-32-characters',
    studentAccessJwtSecret: 'test-only-student-access-jwt-secret-at-least-32-characters',
    acWebhookSecret: 'test-only-ac-webhook-secret-at-least-32-characters',
    authEnforce: true,
    enableDebugRoutes: false,
    allowedOrigins: ['http://localhost:3000'],
    port: 3001,
    core: {
      nodeEnv: 'test',
      mongoUri: 'mongodb://database.internal/bo2',
      jwtSecret: 'test-only-jwt-secret-with-at-least-32-characters',
      oldApiJwtSecret: 'test-only-old-api-jwt-secret-at-least-32-characters',
      studentAccessJwtSecret: 'test-only-student-access-jwt-secret-at-least-32-characters',
      acWebhookSecret: 'test-only-ac-webhook-secret-at-least-32-characters',
      authEnforce: true,
      enableDebugRoutes: false,
      allowedOrigins: ['http://localhost:3000'],
      port: 3001,
    },
    observability: {
      logLevel: 'info',
      metricsEnabled: false,
      logDirectory: 'logs',
      fileLoggingEnabled: false,
      consoleLoggingEnabled: false,
    },
    integrations: {
      activeCampaign: { configured: false },
      fmp: { configured: false },
      hotmart: { configured: false },
      curseduca: { configured: false },
      guru: { configured: false },
      discord: { configured: false },
      slack: { configured: false },
      studentSummary: { configured: false },
      legacyApi: { configured: false },
    },
    renewal: {
      acSyncEnabled: false,
      writeDatesEnabled: false,
      writeTagsEnabled: false,
      processRefundsEnabled: false,
      autoExecute: false,
      expiryFieldId: 332,
      maxChangesPerRun: 50,
      discordRolesSyncEnabled: false,
      discordRolesAutoExecute: false,
      discordMessagesEnabled: false,
      discordScheduledMessagesEnabled: false,
      discordRolesMaxOpsPerRun: 100,
      discordMessageChannelId: undefined,
      discordMessageChannels: [],
    },
  }) as AppConfig

afterEach(() => {
  resetRuntimeConfigForTests()
})

test('getRuntimeConfig fails before initialization', () => {
  expect(() => getRuntimeConfig()).toThrow('RUNTIME_CONFIG_NOT_INITIALIZED')
})

test('initialization freezes the config and its nested sections', () => {
  const config = runtimeConfig()

  initializeRuntimeConfig(config)

  expect(getRuntimeConfig()).toBe(config)
  expect(Object.isFrozen(getRuntimeConfig())).toBe(true)
  expect(Object.isFrozen(getRuntimeConfig().core)).toBe(true)
  expect(Object.isFrozen(getRuntimeConfig().integrations)).toBe(true)
  expect(Object.isFrozen(getRuntimeConfig().renewal)).toBe(true)
  expect(Object.isFrozen(getRuntimeConfig().allowedOrigins)).toBe(true)
})

test('repeating initialization with the same values is idempotent', () => {
  const config = runtimeConfig()

  initializeRuntimeConfig(config)
  initializeRuntimeConfig(config)

  expect(getRuntimeConfig()).toBe(config)
})

test('incompatible reinitialization fails without exposing configuration values', () => {
  const config = runtimeConfig()
  const incompatible = { ...config, port: 4321 }

  initializeRuntimeConfig(config)

  expect(() => initializeRuntimeConfig(incompatible)).toThrow(
    'RUNTIME_CONFIG_ALREADY_INITIALIZED',
  )
  expect(() => initializeRuntimeConfig(incompatible)).not.toThrow(
    String(incompatible.port),
  )
})

test('test reset permits an explicit fresh initialization', () => {
  const config = runtimeConfig()

  initializeRuntimeConfig(config)
  resetRuntimeConfigForTests()

  expect(() => getRuntimeConfig()).toThrow('RUNTIME_CONFIG_NOT_INITIALIZED')
  expect(() => initializeRuntimeConfig(runtimeConfig())).not.toThrow()
})
