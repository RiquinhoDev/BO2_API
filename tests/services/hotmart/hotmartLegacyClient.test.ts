import { createHotmartLegacyClient } from '../../../src/services/hotmart/hotmartLegacyClient'

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' }

function dependencies() {
  return {
    http: {
      post: jest.fn(),
      get: jest.fn()
    },
    readCredentials: jest.fn(() => credentials),
    readSubdomain: jest.fn(() => 'clareza'),
    describeError: jest.fn((error: unknown) => ({ message: error instanceof Error ? error.message : String(error) })),
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  }
}

test('requests an OAuth token with Basic authentication', async () => {
  const deps = dependencies()
  deps.http.post.mockResolvedValue({ data: { access_token: 'token', expires_in: 3600 } })
  const client = createHotmartLegacyClient(deps)

  await expect(client.getAccessToken()).resolves.toBe('token')
  expect(deps.http.post).toHaveBeenCalledWith(
    'https://api-sec-vlc.hotmart.com/security/oauth/token',
    new URLSearchParams({ grant_type: 'client_credentials' }),
    { headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
    } }
  )
})

test('fails when the OAuth response has no access token', async () => {
  const deps = dependencies()
  deps.http.post.mockResolvedValue({ data: {} })
  const client = createHotmartLegacyClient(deps)

  await expect(client.getAccessToken()).rejects.toThrow(
    'Falha ao obter token de acesso da Hotmart: Access token não encontrado na resposta'
  )
})

test.each([
  [{ users: [{ id: 'u1' }], page_info: { next_page_token: 'next' } }, 'next'],
  [{ items: [{ id: 'u1' }], pageInfo: { nextPageToken: 'next' } }, 'next'],
  [{ data: [{ id: 'u1' }], pagination: { next_page_token: 'next' } }, 'next'],
  [{ users: [{ id: 'u1' }], pagination: { nextPageToken: 'next' } }, 'next']
])('normalizes users and pagination variants', async (data, nextPageToken) => {
  const deps = dependencies()
  deps.http.get.mockResolvedValue({ data })
  const client = createHotmartLegacyClient(deps)

  await expect(client.listUsersPage('token', 'page 1')).resolves.toEqual({
    users: [{ id: 'u1' }],
    nextPageToken
  })
  expect(deps.http.get).toHaveBeenCalledWith(
    'https://developers.hotmart.com/club/api/v1/users?subdomain=clareza&page_token=page%201',
    { headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } }
  )
})

test('rejects a users payload that is not an array', async () => {
  const deps = dependencies()
  deps.http.get.mockResolvedValue({ data: { users: 'invalid' } })
  const client = createHotmartLegacyClient(deps)

  await expect(client.listUsersPage('token')).rejects.toThrow(
    'Resposta inválida da API: esperado array, recebido string'
  )
})

test('returns lessons and isolates a lesson request failure', async () => {
  const deps = dependencies()
  const lessons = [{
    page_id: 'lesson',
    page_name: 'Lesson',
    module_name: 'Module',
    is_module_extra: false,
    is_completed: true
  }]
  deps.http.get.mockResolvedValueOnce({ data: { lessons } }).mockRejectedValueOnce(new Error('offline'))
  const client = createHotmartLegacyClient(deps)

  await expect(client.listUserLessons('user/id', 'token')).resolves.toEqual(lessons)
  await expect(client.listUserLessons('user/id', 'token')).resolves.toEqual([])
  expect(deps.http.get).toHaveBeenCalledWith(
    'https://developers.hotmart.com/club/api/v1/users/user%2Fid/lessons?subdomain=clareza',
    { headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } }
  )
})
