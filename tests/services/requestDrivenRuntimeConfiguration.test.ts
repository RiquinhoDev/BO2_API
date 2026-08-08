import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import {
  getCurseducaRuntimeSettings,
  getGuruAccountToken,
  getGuruUserToken,
  getSlackWebhookUrl,
  getStudentSummaryToken,
} from '../../src/services/requestDrivenRuntimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const ENV_KEYS = [
  'CURSEDUCA_API_URL',
  'CURSEDUCA_API_KEY',
  'CURSEDUCA_AccessToken',
  'GURU_USER_TOKEN',
  'GURU_ACCOUNT_TOKEN',
  'SLACK_WEBHOOK_URL',
  'STUDENT_SUMMARY_TOKEN',
] as const

const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  resetRuntimeConfigForTests()
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key]
    if (originalValue === undefined) delete process.env[key]
    else process.env[key] = originalValue
  }
})

test('request-driven integrations use immutable runtime config instead of ambient env', () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      curseduca: {
        configured: true,
        value: {
          apiUrl: 'https://curseduca.runtime.invalid',
          apiKey: 'runtime-api-key',
          accessToken: 'runtime-access-token',
        },
      },
      guru: {
        configured: true,
        value: {
          userToken: 'runtime-user-token',
          accountToken: 'runtime-account-token',
        },
      },
      slack: { configured: true, value: { webhookUrl: 'https://slack.runtime.invalid' } },
      studentSummary: { configured: true, value: { token: 'runtime-summary-token' } },
    },
  })

  for (const key of ENV_KEYS) process.env[key] = `ambient-${key}`

  expect(getCurseducaRuntimeSettings()).toEqual({
    apiUrl: 'https://curseduca.runtime.invalid',
    apiKey: 'runtime-api-key',
    accessToken: 'runtime-access-token',
  })
  expect(getGuruUserToken()).toBe('runtime-user-token')
  expect(getGuruAccountToken()).toBe('runtime-account-token')
  expect(getSlackWebhookUrl()).toBe('https://slack.runtime.invalid')
  expect(getStudentSummaryToken()).toBe('runtime-summary-token')
})

test('required request-driven integrations fail closed before any HTTP can start', () => {
  initializeRuntimeConfig(createTestRuntimeConfig())

  expect(() => getCurseducaRuntimeSettings()).toThrow(IntegrationUnavailableError)
  expect(() => getGuruUserToken()).toThrow(IntegrationUnavailableError)
  expect(() => getGuruAccountToken()).toThrow(IntegrationUnavailableError)
  expect(getSlackWebhookUrl()).toBeUndefined()
  expect(getStudentSummaryToken()).toBeUndefined()
})
