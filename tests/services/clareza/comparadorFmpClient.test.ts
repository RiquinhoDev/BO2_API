import {
  AxiosComparadorFmpClient,
  type ComparadorFmpHttpPort,
} from '../../../src/services/clareza/comparador/comparadorFmpClient'

type ScriptedResponse =
  | { readonly data: unknown }
  | { readonly error: unknown }

interface RecordedFmpCall {
  readonly url: string
  readonly options: { readonly params: Readonly<Record<string, string>>; readonly timeout: number }
}

class ScriptedFmpHttp implements ComparadorFmpHttpPort {
  readonly calls: RecordedFmpCall[] = []

  constructor(private readonly responses: ReadonlyMap<string, readonly ScriptedResponse[]>) {}

  private readonly offsets = new Map<string, number>()

  async get(
    url: string,
    options: { readonly params: Readonly<Record<string, string>>; readonly timeout: number },
  ): Promise<{ readonly data: unknown }> {
    this.calls.push({ url, options })
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
function calledPaths(http: ScriptedFmpHttp): string[] {
  return http.calls.map((call) => new URL(call.url).pathname)
}

function expectFmpRequest(call: RecordedFmpCall, path: string, ticker: string): void {
  expect(call).toEqual({
    url: `https://financialmodelingprep.com${path}`,
    options: { params: { apikey: 'immutable-test-key', symbol: ticker }, timeout: 15000 },
  })
}
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

    expect(calledPaths(http)).toEqual([
      '/stable/profile',
      '/stable/profile',
      '/stable/ratios-ttm',
      '/stable/key-metrics-ttm',
      '/stable/grades-consensus',
      '/stable/price-target-consensus',
    ])
    expectFmpRequest(http.calls[0], '/stable/profile', 'AAPL')
  })

  it('uses the shared policy to retry a 5xx response failure', async () => {
    const profile = { companyName: 'Apple Inc.', price: 213.49 }
    const responses = endpointResponses(profile)
    responses.set('/stable/profile', [
      { error: { response: { status: 500 } } },
      { data: [profile] },
    ])
    const http = new ScriptedFmpHttp(responses)
    let sleepCalls = 0
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => 'immutable-test-key',
      throttle: async () => undefined,
      sleep: async () => { sleepCalls += 1 },
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('AAPL')).resolves.toMatchObject({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      price: 213.49,
    })
    expect(calledPaths(http)).toEqual([
      '/stable/profile',
      '/stable/profile',
      '/stable/ratios-ttm',
      '/stable/key-metrics-ttm',
      '/stable/grades-consensus',
      '/stable/price-target-consensus',
    ])
    expect(sleepCalls).toBe(1)
  })

  it('does not retry a non-rate-limit 4xx response failure', async () => {
    const http = new ScriptedFmpHttp(new Map([
      ['/stable/profile', [{ error: { response: { status: 404 } } }]],
      ['/stable/quote', [{ error: { response: { status: 404 } } }]],
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

    await expect(client.fetchCompany('O')).resolves.toEqual({
      ticker: 'O',
      name: 'Realty Income Corporation',
      image: null,
      sector: 'Real Estate',
      industry: 'REIT - Retail',
      country: null,
      currency: 'USD',
      exchange: 'NYSE',
      isReit: true,
      price: 57.13,
      change: null,
      perf12m: null,
      marketCap: null,
      beta: null,
      pe: null,
      peg: null,
      ps: null,
      pb: null,
      evEbitda: null,
      pFfo: 5.19,
      grossMargin: null,
      netMargin: null,
      roe: null,
      roic: null,
      fcfYield: null,
      debtEquity: null,
      debtEbitda: null,
      dividendYield: null,
      payoutRatio: null,
      ffoPayout: 18.18,
      analystConsensus: null,
      strongBuy: null,
      buy: null,
      hold: null,
      sell: null,
      strongSell: null,
      targetConsensus: null,
      upside: null,
      updated: '2026-08-11T09:30:00.000Z',
    })
    expect(http.calls[5]).toEqual({ url: 'https://financialmodelingprep.com/stable/income-statement', options: { params: { apikey: 'immutable-test-key', symbol: 'O', period: 'annual', limit: '1' }, timeout: 15000 } })
    expect(http.calls[6]).toEqual({ url: 'https://financialmodelingprep.com/stable/cash-flow-statement', options: { params: { apikey: 'immutable-test-key', symbol: 'O', period: 'annual', limit: '1' }, timeout: 15000 } })
  })

  it('falls back to quote after an empty profile and keeps a successful profile away from quote', async () => {
    const quote = {
      name: 'Samsung Electronics',
      price: 71,
      currency: 'KRW',
      exchange: 'KOSPI',
    }
    const responses = endpointResponses(quote)
    responses.set('/stable/profile', [{ data: [] }])
    responses.set('/stable/quote', [{ data: [quote] }])
    const http = new ScriptedFmpHttp(responses)
    const client = new AxiosComparadorFmpClient({
      http,
      getApiKey: () => 'immutable-test-key',
      throttle: async () => undefined,
      sleep: async () => undefined,
      now: () => '2026-08-11T09:30:00.000Z',
    })

    await expect(client.fetchCompany('005930.KS')).resolves.toMatchObject({
      ticker: '005930.KS',
      name: 'Samsung Electronics',
      price: 71,
      currency: 'KRW',
      exchange: 'KOSPI',
    })
    expect(calledPaths(http)).toEqual([
      '/stable/profile',
      '/stable/quote',
      '/stable/ratios-ttm',
      '/stable/key-metrics-ttm',
      '/stable/grades-consensus',
      '/stable/price-target-consensus',
    ])
    expectFmpRequest(http.calls[0], '/stable/profile', '005930.KS')
    expectFmpRequest(http.calls[1], '/stable/quote', '005930.KS')
  })

  it('stops retrying the profile after exactly three 429 responses', async () => {
    const responses = endpointResponses({})
    responses.set('/stable/profile', [
      { error: { response: { status: 429 } } },
      { error: { response: { status: 429 } } },
      { error: { response: { status: 429 } } },
    ])
    responses.set('/stable/quote', [{ data: [] }])
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

    await expect(client.fetchCompany('AAPL')).resolves.toBeNull()
    expect(calledPaths(http)).toEqual(['/stable/profile', '/stable/profile', '/stable/profile', '/stable/quote'])
    expect(sleepCalls).toBe(2)
    expect(throttleCalls).toBe(4)
  })
})
