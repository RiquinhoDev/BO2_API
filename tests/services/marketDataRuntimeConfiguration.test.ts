import axios from 'axios'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import {
  assertClarezaRefreshEnabled,
  getFmpApiKey,
  getHotmartCredentials,
  getHotmartSubdomain,
  getHotmartSyncUserId,
} from '../../src/services/requestDrivenRuntimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

jest.mock('axios')

const mockedAxios = jest.mocked(axios)

const ENV_KEYS = [
  'FMP_API_KEY',
  'HOTMART_CLIENT_ID',
  'HOTMART_CLIENT_SECRET',
  'HOTMART_SUBDOMAIN',
  'COURSE_LESSON_SUBDOMAIN',
  'COURSE_LESSON_SYNC_USER_ID',
  'subdomain',
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

test('market-data consumers use immutable runtime values instead of ambient env', () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      fmp: { configured: true, value: { apiKey: 'runtime-fmp-key' } },
      hotmart: {
        configured: true,
        value: {
          clientId: 'runtime-client-id',
          clientSecret: 'runtime-client-secret',
          subdomain: 'runtime-subdomain',
          syncUserId: 'runtime-sync-user',
        },
      },
    },
  })
  for (const key of ENV_KEYS) process.env[key] = `ambient-${key}`

  expect(getFmpApiKey()).toBe('runtime-fmp-key')
  expect(getHotmartCredentials()).toEqual({
    clientId: 'runtime-client-id',
    clientSecret: 'runtime-client-secret',
  })
  expect(getHotmartSubdomain()).toBe('runtime-subdomain')
  expect(getHotmartSyncUserId()).toBe('runtime-sync-user')
})

test('required FMP and Hotmart settings fail closed before external I/O', () => {
  initializeRuntimeConfig(createTestRuntimeConfig())

  expect(() => getFmpApiKey()).toThrow(IntegrationUnavailableError)
  expect(() => getHotmartCredentials()).toThrow(IntegrationUnavailableError)
  expect(() => getHotmartSubdomain()).toThrow(IntegrationUnavailableError)
  expect(getHotmartSyncUserId()).toBeUndefined()
})

test('Clareza refresh and FMP egress switches fail closed independently', () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      fmp: { configured: true, value: { apiKey: 'runtime-fmp-key' } },
    },
    operationalControls: {
      schedulerEnabled: true,
      clarezaRefreshEnabled: false,
      clarezaFmpEgressEnabled: false,
    },
  })

  expect(() => assertClarezaRefreshEnabled()).toThrow(IntegrationUnavailableError)
  expect(() => getFmpApiKey()).toThrow(IntegrationUnavailableError)
  expect(mockedAxios.get).not.toHaveBeenCalled()
})
