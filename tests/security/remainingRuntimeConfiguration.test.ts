import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { isClarezaRefreshAuthorized } from '../../src/security/clarezaRefreshAuthorization'
import {
  getOptionalOldApiUrl,
  isDevelopmentRuntime,
} from '../../src/services/requestDrivenRuntimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const originalEnvironment = {
  CLAREZA_REFRESH_TOKEN: process.env.CLAREZA_REFRESH_TOKEN,
  OLD_API_URL: process.env.OLD_API_URL,
  NODE_ENV: process.env.NODE_ENV,
}

afterEach(() => {
  resetRuntimeConfigForTests()
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('remaining request consumers use immutable runtime config instead of ambient env', () => {
  const base = createTestRuntimeConfig({ nodeEnv: 'development' })
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      clareza: { configured: true, value: { refreshToken: 'runtime-refresh-token' } },
      legacyApi: { configured: true, value: { apiUrl: 'https://legacy.example.test' } },
    },
  })
  process.env.CLAREZA_REFRESH_TOKEN = 'ambient-refresh-token'
  process.env.OLD_API_URL = 'https://ambient.example.test'
  process.env.NODE_ENV = 'production'

  expect(isClarezaRefreshAuthorized('runtime-refresh-token')).toBe(true)
  expect(isClarezaRefreshAuthorized('ambient-refresh-token')).toBe(false)
  expect(getOptionalOldApiUrl()).toBe('https://legacy.example.test')
  expect(isDevelopmentRuntime()).toBe(true)
})

test('unconfigured optional boundaries fail closed without ambient fallbacks', () => {
  initializeRuntimeConfig(createTestRuntimeConfig())
  process.env.CLAREZA_REFRESH_TOKEN = 'ambient-refresh-token'
  process.env.OLD_API_URL = 'https://ambient.example.test'
  process.env.NODE_ENV = 'development'

  expect(isClarezaRefreshAuthorized('ambient-refresh-token')).toBe(false)
  expect(isClarezaRefreshAuthorized('')).toBe(false)
  expect(isClarezaRefreshAuthorized('different-length-token')).toBe(false)
  expect(getOptionalOldApiUrl()).toBeUndefined()
  expect(isDevelopmentRuntime()).toBe(false)
})
