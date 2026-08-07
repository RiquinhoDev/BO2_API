// Offline test of the real axios-backed Hotmart client (mocked axios): token
// request, URL/subdomain, page_token encoding, envelope normalization, next
// token extraction, and the fail-closed unconfigured path.
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), isAxiosError: () => false },
}))

import axios from 'axios'
import { AxiosHotmartClubClient, HotmartNotConfiguredError } from '../../../src/services/classes/hotmartClubClient'

const mockedPost = axios.post as jest.Mock
const mockedGet = axios.get as jest.Mock
const config = { subdomain: 'test-subdomain', clientId: 'cid', clientSecret: 'csec' }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('AxiosHotmartClubClient.getAccessToken', () => {
  it('posts to the oauth endpoint with basic auth and returns the token', async () => {
    mockedPost.mockResolvedValue({ data: { access_token: 'tok-123' } })
    const client = new AxiosHotmartClubClient(config)

    expect(await client.getAccessToken()).toBe('tok-123')
    const [url, , cfg] = mockedPost.mock.calls[0]
    expect(url).toBe('https://api-sec-vlc.hotmart.com/security/oauth/token')
    expect(cfg.headers.Authorization).toMatch(/^Basic .+/)
  })

  it('throws when the token is absent', async () => {
    mockedPost.mockResolvedValue({ data: {} })
    const client = new AxiosHotmartClubClient(config)
    await expect(client.getAccessToken()).rejects.toThrow('Access token not found')
  })
})

describe('AxiosHotmartClubClient.fetchUsersPage', () => {
  it('builds the subdomain URL, normalizes items, and extracts the next token', async () => {
    mockedGet.mockResolvedValue({ data: { items: [{ email: 'a@x.test' }], page_info: { next_page_token: 'N2' } } })
    const client = new AxiosHotmartClubClient(config)

    const page = await client.fetchUsersPage('tok', null)

    expect(page.users).toEqual([{ email: 'a@x.test' }])
    expect(page.nextPageToken).toBe('N2')
    const url = String(mockedGet.mock.calls[0][0])
    expect(url).toContain('subdomain=test-subdomain')
    expect(url).not.toContain('page_token')
  })

  it('encodes the page_token on the second page', async () => {
    mockedGet.mockResolvedValue({ data: { users: [], page_info: {} } })
    const client = new AxiosHotmartClubClient(config)

    await client.fetchUsersPage('tok', 'tok/2 +x')

    expect(String(mockedGet.mock.calls[0][0])).toContain('page_token=tok%2F2%20%2Bx')
  })

  it('falls back to the data field and a null next token', async () => {
    mockedGet.mockResolvedValue({ data: { data: [{ email: 'b@x.test' }] } })
    const client = new AxiosHotmartClubClient(config)

    const page = await client.fetchUsersPage('tok', null)
    expect(page.users).toEqual([{ email: 'b@x.test' }])
    expect(page.nextPageToken).toBeNull()
  })
})

describe('AxiosHotmartClubClient fail-closed', () => {
  it('reports unconfigured and never contacts the network', async () => {
    const client = new AxiosHotmartClubClient(null)

    expect(client.isConfigured()).toBe(false)
    await expect(client.getAccessToken()).rejects.toBeInstanceOf(HotmartNotConfiguredError)
    await expect(client.fetchUsersPage('tok', null)).rejects.toBeInstanceOf(HotmartNotConfiguredError)
    expect(mockedPost).not.toHaveBeenCalled()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
