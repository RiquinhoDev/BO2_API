import {
  FmpJsonClient,
  type FmpJsonHttpPort,
} from '../../../src/services/clareza/fmpJsonClient'

type ScriptedResponse = { readonly data: unknown } | { readonly error: unknown }

class ScriptedHttp implements FmpJsonHttpPort {
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
    const response = this.responses[Math.min(this.offset, this.responses.length - 1)] ?? { data: null }
    this.offset += 1
    if ('error' in response) throw response.error
    return { data: response.data }
  }
}

function createClient(
  responses: readonly ScriptedResponse[],
  getApiKey: () => string | undefined = () => 'immutable-test-key',
) {
  const http = new ScriptedHttp(responses)
  const throttle = jest.fn().mockResolvedValue(undefined)
  const sleep = jest.fn().mockResolvedValue(undefined)
  const client = new FmpJsonClient({ getApiKey, http, throttle, sleep })
  return { client, http, throttle, sleep }
}

const request = {
  baseUrl: 'https://financialmodelingprep.com/stable',
  path: '/earnings',
  params: { symbol: 'AAPL' },
}

describe('FmpJsonClient', () => {
  it('fails closed without a key and preserves typed configuration errors', async () => {
    const unavailable = createClient([{ data: [] }], () => undefined)
    await expect(unavailable.client.get(request)).resolves.toBeNull()
    expect(unavailable.http.calls).toEqual([])
    expect(unavailable.throttle).not.toHaveBeenCalled()

    const error = new Error('typed configuration unavailable')
    const invalid = createClient([{ data: [] }], () => { throw error })
    await expect(invalid.client.get(request)).rejects.toBe(error)
    expect(invalid.http.calls).toEqual([])
  })

  it('uses TLS, timeout, and the injected key despite forged request parameters', async () => {
    const { client, http } = createClient([{ data: [{ date: '2026-09-01' }] }])

    await expect(client.get({
      ...request,
      params: { symbol: 'AAPL', apikey: 'forged-key' },
    })).resolves.toEqual([{ date: '2026-09-01' }])
    expect(http.calls).toEqual([{
      url: 'https://financialmodelingprep.com/stable/earnings',
      options: {
        params: { symbol: 'AAPL', apikey: 'immutable-test-key' },
        timeout: 15000,
      },
    }])
  })

  it.each([
    ['HTTP base URL', { ...request, baseUrl: 'http://financialmodelingprep.com/stable' }],
    ['foreign host', { ...request, baseUrl: 'https://example.com/stable' }],
    ['absolute path', { ...request, path: '//example.com/escape' }],
    ['path traversal', { ...request, path: '/../api/v3/profile/AAPL' }],
    ['excessive timeout', { ...request, timeoutMs: 30001 }],
  ])('rejects an unsafe transport boundary: %s', async (_label, unsafeRequest) => {
    const { client, http, throttle } = createClient([{ data: [] }])

    await expect(client.get(unsafeRequest)).rejects.toBeInstanceOf(RangeError)
    expect(http.calls).toEqual([])
    expect(throttle).not.toHaveBeenCalled()
  })

  it('retries retryable failures through the common policy', async () => {
    const { client, http, throttle, sleep } = createClient([
      { error: { response: { status: 503 } } },
      { data: [] },
    ])

    await expect(client.get(request)).resolves.toEqual([])
    expect(http.calls).toHaveLength(2)
    expect(throttle).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('deduplicates equivalent owners and isolates cancelable owners', async () => {
    const shared = createClient([{ data: [] }])
    await Promise.all([shared.client.get(request), shared.client.get(request)])
    expect(shared.http.calls).toHaveLength(1)

    const isolated = createClient([{ data: [] }])
    await Promise.all([
      isolated.client.get({ ...request, signal: new AbortController().signal }),
      isolated.client.get({ ...request, signal: new AbortController().signal }),
    ])
    expect(isolated.http.calls).toHaveLength(2)
  })
})
