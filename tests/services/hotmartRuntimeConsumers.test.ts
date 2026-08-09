import axios from 'axios'
import {
  initializeRuntimeConfig,
  resetRuntimeConfigForTests,
} from '../../src/config/runtimeConfig'
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import {
  fetchAllHotmartUsers,
  fetchUserLessons,
  getHotmartAccessToken,
} from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { hotmartLessonsService } from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

jest.mock('axios')

const mockedAxios = jest.mocked(axios)

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.clearAllMocks()
})

test('Hotmart consumers use runtime credentials and subdomain instead of ambient env', async () => {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: {
      ...base.integrations,
      hotmart: {
        configured: true,
        value: {
          clientId: 'runtime-client',
          clientSecret: 'runtime-secret',
          subdomain: 'runtime-club',
        },
      },
    },
  })
  process.env.HOTMART_CLIENT_ID = 'ambient-client'
  process.env.HOTMART_CLIENT_SECRET = 'ambient-secret'
  process.env.subdomain = 'ambient-club'
  mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'token', expires_in: 60 } })
  mockedAxios.get.mockResolvedValueOnce({ data: { users: [], page_info: {} } })

  await expect(getHotmartAccessToken()).resolves.toBe('token')
  expect(mockedAxios.post).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(URLSearchParams),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from('runtime-client:runtime-secret').toString('base64')}`,
      }),
    }),
  )

  await expect(fetchAllHotmartUsers('token')).resolves.toEqual([])
  expect(mockedAxios.get).toHaveBeenCalledWith(
    expect.stringContaining('subdomain=runtime-club'),
    expect.any(Object),
  )
})

test('missing Hotmart config fails closed before any HTTP request', async () => {
  initializeRuntimeConfig(createTestRuntimeConfig())

  await expect(getHotmartAccessToken()).rejects.toBeInstanceOf(IntegrationUnavailableError)
  await expect(fetchAllHotmartUsers('token')).rejects.toBeInstanceOf(IntegrationUnavailableError)
  await expect(fetchUserLessons('user', 'token')).rejects.toBeInstanceOf(IntegrationUnavailableError)
  await expect(hotmartLessonsService.getUserLessons('user', 'club')).rejects.toBeInstanceOf(
    IntegrationUnavailableError,
  )
  expect(mockedAxios.post).not.toHaveBeenCalled()
  expect(mockedAxios.get).not.toHaveBeenCalled()
})
