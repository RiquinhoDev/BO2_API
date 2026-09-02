import type { AppConfig, NodeEnvironment } from '../../src/config/configTypes'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'

export function createTestRuntimeConfig(options: {
  nodeEnv?: NodeEnvironment
  logLevel?: string
  serverVersion?: string
  metricsEnabled?: boolean
} = {}): AppConfig {
  const nodeEnv = options.nodeEnv ?? 'test'
  const core = {
    nodeEnv,
    ...(options.serverVersion !== undefined ? { serverVersion: options.serverVersion } : {}),
    mongoUri: 'mongodb://database.internal/bo2',
    jwtSecret: 'test-only-jwt-secret-with-at-least-32-characters',
    oldApiJwtSecret: 'test-only-old-api-jwt-secret-at-least-32-characters',
    studentAccessJwtSecret: 'test-only-student-access-jwt-secret-at-least-32-characters',
    acWebhookSecret: 'test-only-ac-webhook-secret-at-least-32-characters',
    authEnforce: true,
    enableDebugRoutes: false,
    allowedOrigins: ['http://localhost:3000'],
    port: 3001,
  }

  return {
    ...core,
    core,
    observability: {
      logLevel: options.logLevel ?? 'info',
      metricsEnabled: options.metricsEnabled ?? false,
      logDirectory: 'logs',
      fileLoggingEnabled: nodeEnv !== 'test',
      consoleLoggingEnabled: nodeEnv === 'development',
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
      discordMessageChannels: [],
    },
  }
}


export function useTestRuntimeConfig(options: Parameters<typeof createTestRuntimeConfig>[0] = {}): AppConfig {
  const config = createTestRuntimeConfig(options)
  initializeRuntimeConfig(config)
  return config
}

export function installTestRuntimeConfigHooks(
  options: Parameters<typeof createTestRuntimeConfig>[0] = {},
): void {
  beforeEach(() => {
    useTestRuntimeConfig(options)
  })

  afterEach(() => {
    resetRuntimeConfigForTests()
  })
}

export { resetRuntimeConfigForTests }
