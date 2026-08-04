const mockFindUserById = jest.fn()
const mockFindUserProduct = jest.fn()
const mockUser = { findById: mockFindUserById }
const mockUserProduct = { findOne: mockFindUserProduct }

jest.mock('../../src/models', () => ({
  User: mockUser,
  UserProduct: mockUserProduct,
}))

import axios from 'axios'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { activeCampaignService } from '../../src/services/activeCampaign/activeCampaignService'
import { createTestRuntimeConfig, useTestRuntimeConfig } from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

test('unconfigured ActiveCampaign fails before an HTTP client is created', async () => {
  useTestRuntimeConfig()
  const createClient = jest.spyOn(axios, 'create')

  await expect(activeCampaignService.getContactByEmail('student@example.test'))
    .rejects.toBeInstanceOf(IntegrationUnavailableError)

  expect(createClient).not.toHaveBeenCalled()
})

test.each([
  ['contact ID', () => activeCampaignService.getContactId('student@example.test')],
  ['cached contact ID', () => activeCampaignService.getContactId('student@example.test', 'user-id')],
  ['apply product tag', () => activeCampaignService.applyTagToUserProduct('user-id', 'product-id', 'tag')],
  ['remove product tag', () => activeCampaignService.removeTagFromUserProduct('user-id', 'product-id', 'tag')],
  ['sync product contact', () => activeCampaignService.syncContactByProduct('user-id', 'product-id')],
  ['remove all product tags', () => activeCampaignService.removeAllProductTags('user-id', 'product-id')],
  ['contact tags', () => activeCampaignService.getContactTagsByEmail('student@example.test')],
  ['tag removal', () => activeCampaignService.removeTag('student@example.test', 'tag')],
  ['connection check', () => activeCampaignService.testConnection()],
])('unconfigured %s propagates the typed error before HTTP', async (_name, call) => {
  useTestRuntimeConfig()
  const createClient = jest.spyOn(axios, 'create')

  await expect(call()).rejects.toMatchObject({
    name: 'IntegrationUnavailableError',
    integration: 'activeCampaign',
  })

  expect(createClient).not.toHaveBeenCalled()
  expect(mockFindUserById).not.toHaveBeenCalled()
  expect(mockFindUserProduct).not.toHaveBeenCalled()
})

test('configured ActiveCampaign builds its client from typed runtime values', async () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      activeCampaign: {
        configured: true,
        value: {
          apiUrl: 'https://typed-ac.example.test/',
          apiKey: 'typed-api-key',
          webhookSecret: 'typed-webhook-secret',
          debugEnabled: true,
          verifyDeleteEnabled: true,
          lists: {},
        },
      },
    },
  })

  const previousUrl = process.env.AC_API_URL
  const previousKey = process.env.AC_API_KEY
  process.env.AC_API_URL = 'https://ambient-ac.invalid/'
  process.env.AC_API_KEY = 'ambient-api-key'
  const get = jest.fn().mockResolvedValue({ data: { contacts: [] } })
  const createClient = jest.spyOn(axios, 'create').mockReturnValue({ get } as never)

  try {
    await expect(activeCampaignService.getContactByEmail('student@example.test')).resolves.toBeNull()

    expect(createClient).toHaveBeenCalledWith({
      baseURL: 'https://typed-ac.example.test/',
      timeout: 30_000,
      headers: {
        'Api-Token': 'typed-api-key',
        'Content-Type': 'application/json',
      },
    })
    expect(get).toHaveBeenCalledWith('/api/3/contacts', {
      params: { email: 'student@example.test' },
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    })
  } finally {
    if (previousUrl === undefined) delete process.env.AC_API_URL
    else process.env.AC_API_URL = previousUrl
    if (previousKey === undefined) delete process.env.AC_API_KEY
    else process.env.AC_API_KEY = previousKey
  }
})
