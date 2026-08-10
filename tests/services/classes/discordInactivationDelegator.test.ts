// Offline test of the real axios-backed Discord adapter (mocked axios), covering
// explicit URL / payload / scope JWT / timeout, the normalized response, the
// fail-closed no-URL path, and best-effort failure without leaking.
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), isAxiosError: () => false },
}))

import axios from 'axios'
import { configureJwt } from '../../../src/security/jwt'
import { AxiosDiscordInactivationDelegator } from '../../../src/services/classes/discordInactivationDelegator'

const mockedPost = axios.post as jest.Mock

beforeAll(() => {
  configureJwt({ jwtSecret: 'app-secret', oldApiJwtSecret: 'old-api-secret', studentAccessJwtSecret: 'student-secret' })
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('AxiosDiscordInactivationDelegator', () => {
  it('posts to the explicit URL with the discord payload, admin JWT and timeout', async () => {
    mockedPost.mockResolvedValue({ data: { list: { totalDiscordUpdates: 7 } } })
    const delegator = new AxiosDiscordInactivationDelegator('https://old.example.test')

    const count = await delegator.delegate(['c1', 'c2'], 'discord-inactivation-bulk')

    expect(count).toBe(7)
    expect(mockedPost).toHaveBeenCalledTimes(1)
    const [url, body, config] = mockedPost.mock.calls[0]
    expect(url).toBe('https://old.example.test/classes/inactivationLists/create')
    expect(body).toEqual({ classIds: ['c1', 'c2'], platforms: ['discord'] })
    expect(config.timeout).toBe(120000)
    expect(config.headers.Authorization).toMatch(/^Bearer .+/)
  })

  it('falls back to the discordUpdates field of the response', async () => {
    mockedPost.mockResolvedValue({ data: { discordUpdates: 3 } })
    const delegator = new AxiosDiscordInactivationDelegator('https://old.example.test')
    expect(await delegator.delegate(['c1'], 'scope')).toBe(3)
  })

  it('is fail-closed when no URL is configured: no network call, returns 0', async () => {
    const delegator = new AxiosDiscordInactivationDelegator(undefined)
    expect(await delegator.delegate(['c1'], 'scope')).toBe(0)
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('resolves an injected URL provider at call time and stays fail-closed while absent', async () => {
    let baseUrl: string | undefined
    const delegator = new AxiosDiscordInactivationDelegator(() => baseUrl)

    await expect(delegator.delegate(['c1'], 'scope')).resolves.toBe(0)
    expect(mockedPost).not.toHaveBeenCalled()

    baseUrl = 'https://old.example.test'
    mockedPost.mockResolvedValue({ data: { discordUpdates: 2 } })
    await expect(delegator.delegate(['c1'], 'scope')).resolves.toBe(2)
    expect(mockedPost).toHaveBeenCalledTimes(1)
  })
  it('is best-effort on failure: returns 0 and never throws or leaks', async () => {
    mockedPost.mockRejectedValue(new Error('network boom'))
    const delegator = new AxiosDiscordInactivationDelegator('https://old.example.test')
    await expect(delegator.delegate(['c1'], 'scope')).resolves.toBe(0)
  })
})
