import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import {
  getOptionalOldApiUrl,
  isDevelopmentRuntime,
} from '../../src/services/requestDrivenRuntimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const originalEnvironment = {
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
      legacyApi: { configured: true, value: { apiUrl: 'https://legacy.example.test' } },
    },
  })
  process.env.OLD_API_URL = 'https://ambient.example.test'
  process.env.NODE_ENV = 'production'

  expect(getOptionalOldApiUrl()).toBe('https://legacy.example.test')
  expect(isDevelopmentRuntime()).toBe(true)
})

test('unconfigured optional boundaries fail closed without ambient fallbacks', () => {
  initializeRuntimeConfig(createTestRuntimeConfig())
  process.env.OLD_API_URL = 'https://ambient.example.test'
  process.env.NODE_ENV = 'development'

  expect(getOptionalOldApiUrl()).toBeUndefined()
  expect(isDevelopmentRuntime()).toBe(false)
})
