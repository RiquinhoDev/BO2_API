import {
  AxiosComparadorFmpClient,
  type ComparadorFmpHttpPort,
} from '../../../src/services/clareza/comparador/comparadorFmpClient'

type ScriptedResponse =
  | { readonly data: unknown }
  | { readonly error: unknown }

class ScriptedFmpHttp implements ComparadorFmpHttpPort {
  readonly calls: string[] = []

  constructor(private readonly responses: ReadonlyMap<string, readonly ScriptedResponse[]>) {}

  private readonly offsets = new Map<string, number>()

  async get(url: string): Promise<{ readonly data: unknown }> {
    this.calls.push(url)
    const pathname = new URL(url).pathname
    const responses = this.responses.get(pathname) ?? [{ data: {} }]
    const offset = this.offsets.get(pathname) ?? 0
    this.offsets.set(pathname, offset + 1)
    const response = responses[Math.min(offset, responses.length - 1)]

    if ('error' in response) throw response.error
    return { data: response.data }
  }
}

function endpointResponses(profile: unknown, reit = false): Map<string, readonly ScriptedResponse[]> {
  const responses = new Map<string, readonly ScriptedResponse[]>([
    ['/stable/profile', [{ data: [profile] }]],
    ['/stable/ratios-ttm', [{ data: [{}] }]],
    ['/stable/key-metrics-ttm', [{ data: [{}] }]],
    ['/stable/grades-consensus', [{ data: [{}] }]],
    ['/stable/price-target-consensus', [{ data: [{}] }]],
  ])

  if (reit) {
    responses.set('/stable/income-statement', [{ data: [{ netIncome: 100, weightedAverageShsOut: 10 }] }])
    responses.set('/stable/cash-flow-statement', [{ data: [{ depreciationAndAmortization: 10, netDividendsPaid: -20 }] }])
  }

  return responses
}

describe('AxiosComparadorFmpClient', () => {
  it('does not issue an HTTP request when immutable runtime configuration cannot provide an FMP key', async () => {
    const http = new ScriptedFmpHttp(new Map())
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => { throw new Error('FMP unavailable') },
      throttle: async () => undefined,
      sleep: async () => undefined,
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('AAPL')).resolves.toBeNull()
    expect(http.calls).toEqual([])
  })

  it('retries only a 429 through the shared throttle before returning a decoded company', async () => {
    const profile = {
      companyName: 'Apple Inc.',
      price: 213.49,
      range: '180 - 220',
      currency: 'USD',
      exchangeShortName: 'NASDAQ',
    }
    const responses = endpointResponses(profile)
    responses.set('/stable/profile', [
      { error: { response: { status: 429 } } },
      { data: [profile] },
    ])
    const http = new ScriptedFmpHttp(responses)
    let throttleCalls = 0
    let sleepCalls = 0
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => 'immutable-test-key',
      throttle: async () => { throttleCalls += 1 },
      sleep: async () => { sleepCalls += 1 },
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('AAPL')).resolves.toMatchObject({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      price: 213.49,
      perf12m: 18.61,
      updated: '2026-08-11T09:30:00.000Z',
    })
    expect(sleepCalls).toBe(1)
    expect(throttleCalls).toBe(6)
    expect(http.calls).toHaveLength(6)
  })

  it('does not retry a non-429 response failure', async () => {
    const http = new ScriptedFmpHttp(new Map([
      ['/stable/profile', [{ error: { response: { status: 500 } } }]],
      ['/stable/quote', [{ error: { response: { status: 500 } } }]],
    ]))
    let sleepCalls = 0
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => 'immutable-test-key',
      throttle: async () => undefined,
      sleep: async () => { sleepCalls += 1 },
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('AAPL')).resolves.toBeNull()
    expect(http.calls).toHaveLength(2)
    expect(sleepCalls).toBe(0)
  })

  it('classifies REITs and represents unavailable metrics as null', async () => {
    const http = new ScriptedFmpHttp(endpointResponses({
      companyName: 'Realty Income Corporation',
      price: 57.13,
      sector: 'Real Estate',
      industry: 'REIT - Retail',
      currency: 'USD',
      exchangeShortName: 'NYSE',
    }, true))
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => 'immutable-test-key',
      throttle: async () => undefined,
      sleep: async () => undefined,
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('O')).resolves.toMatchObject({
      ticker: 'O',
      isReit: true,
      pFfo: 5.19,
      ffoPayout: 18.18,
      pe: null,
      grossMargin: null,
      targetConsensus: null,
    })
  })
})
