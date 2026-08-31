import {
  AxiosFmpCarteiraClient,
  type FmpCarteiraHttpPort,
} from '../../../src/services/clareza/carteira/fmpCarteiraClient'

type ScriptedResponse = { readonly data: unknown } | { readonly error: unknown }

class ScriptedHttp implements FmpCarteiraHttpPort {
  readonly calls: Array<{ readonly url: string; readonly options: unknown }> = []
  private offset = 0

  constructor(private readonly responses: readonly ScriptedResponse[]) {}

  async get(
    url: string,
    options: {
      readonly params: Readonly<Record<string, string>>
      readonly timeout: number
      readonly signal?: AbortSignal
    },
  ): Promise<{ readonly data: unknown }> {
    this.calls.push({ url, options })
    const response = this.responses[Math.min(this.offset, this.responses.length - 1)] ?? { data: {} }
    this.offset += 1
    if ('error' in response) throw response.error
    return { data: response.data }
  }
}

function createClient(
  responses: readonly ScriptedResponse[],
  configuration: { readonly apiKey: string | undefined } = { apiKey: 'immutable-test-key' },
) {
  const http = new ScriptedHttp(responses)
  const throttle = jest.fn().mockResolvedValue(undefined)
  const sleep = jest.fn().mockResolvedValue(undefined)
  const client = new AxiosFmpCarteiraClient({ apiKey: configuration.apiKey, http, throttle, sleep })
  return { client, http, throttle, sleep }
}

describe('AxiosFmpCarteiraClient', () => {
  it('fails closed without an API key before throttle or HTTP', async () => {
    const { client, http, throttle } = createClient(
      [{ data: { price: 10 } }],
      { apiKey: undefined },
    )

    await expect(client.fetch('/profile', { symbol: 'AAPL' })).resolves.toBeNull()
    expect(throttle).not.toHaveBeenCalled()
    expect(http.calls).toEqual([])
  })

  it('throttles, sends the injected API key, timeout, and returns the object', async () => {
    const { client, http, throttle } = createClient([{ data: { price: 10 } }])

    await expect(client.fetch<{ price: number }>('/profile', { symbol: 'AAPL' }))
      .resolves.toEqual({ price: 10 })
    expect(throttle).toHaveBeenCalledTimes(1)
    expect(http.calls).toEqual([{
      url: 'https://financialmodelingprep.com/stable/profile',
      options: {
        params: { apikey: 'immutable-test-key', symbol: 'AAPL' },
        timeout: 15000,
      },
    }])
  })

  it('does not allow request parameters to override the injected API key', async () => {
    const { client, http } = createClient([{ data: { price: 10 } }])

    await client.fetch('/profile', { apikey: 'forged-key', symbol: 'AAPL' })

    expect(http.calls[0]).toMatchObject({
      options: { params: { apikey: 'immutable-test-key', symbol: 'AAPL' } },
    })
  })

  it.each([
    ['rate limit', { response: { status: 429 } }],
    ['server failure', { response: { status: 503 } }],
    ['timeout', { code: 'ETIMEDOUT' }],
  ])('retries a %s through the shared policy', async (_label, error) => {
    const { client, http, throttle, sleep } = createClient([
      { error },
      { data: { price: 10 } },
    ])

    await expect(client.fetch('/profile', { symbol: 'AAPL' })).resolves.toEqual({ price: 10 })
    expect(http.calls).toHaveLength(2)
    expect(throttle).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-rate-limit 4xx response', async () => {
    const { client, http, sleep } = createClient([{ error: { response: { status: 404 } } }])

    await expect(client.fetch('/profile')).resolves.toBeNull()
    expect(http.calls).toHaveLength(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('returns the first array element and keeps empty/error payloads as null', async () => {
    await expect(createClient([{ data: [{ price: 1 }, { price: 2 }] }]).client.fetch('/x'))
      .resolves.toEqual({ price: 1 })
    await expect(createClient([{ data: [] }]).client.fetch('/x')).resolves.toBeNull()
    await expect(createClient([{ data: { 'Error Message': 'invalid' } }]).client.fetch('/x'))
      .resolves.toBeNull()
  })

  it('deduplicates equivalent concurrent requests', async () => {
    const { client, http, throttle } = createClient([{ data: { price: 10 } }])

    await expect(Promise.all([
      client.fetch('/profile', { symbol: 'AAPL' }),
      client.fetch('/profile', { symbol: 'AAPL' }),
    ])).resolves.toEqual([{ price: 10 }, { price: 10 }])
    expect(http.calls).toHaveLength(1)
    expect(throttle).toHaveBeenCalledTimes(1)
  })

  it('keeps cancelable owners isolated from deduplication', async () => {
    const { client, http } = createClient([{ data: { price: 10 } }])

    await Promise.all([
      client.fetch('/profile', { symbol: 'AAPL' }, new AbortController().signal),
      client.fetch('/profile', { symbol: 'AAPL' }, new AbortController().signal),
    ])
    expect(http.calls).toHaveLength(2)
  })
})
