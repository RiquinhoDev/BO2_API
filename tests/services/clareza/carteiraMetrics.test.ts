import { CarteiraMetricsFetcher } from '../../../src/services/clareza/carteira/carteiraMetrics'
import type { FmpCarteiraClient } from '../../../src/services/clareza/carteira/fmpCarteiraClient'
import type { CarteiraItem } from '../../../src/services/clareza/carteira/carteiraUniverse'

const clock = { now: () => new Date('2026-05-06T07:08:09.000Z') }

type Call = { path: string; params?: Record<string, string> }

function clientReturning(map: Record<string, object | null>): { client: FmpCarteiraClient; calls: Call[] } {
  const calls: Call[] = []
  const client: FmpCarteiraClient = {
    async fetch<T extends object>(path: string, params?: Record<string, string>): Promise<T | null> {
      calls.push({ path, params })
      return (path in map ? map[path] : null) as T | null
    },
  }
  return { client, calls }
}

describe('CarteiraMetricsFetcher.fetchStock (non-REIT)', () => {
  it('maps profile/ratios/key-metrics, rounds *100 fields, and stamps the clock', async () => {
    const { client, calls } = clientReturning({
      '/profile': { price: 100, changePercentage: 2.5, range: '50-120', currency: 'USD', exchangeShortName: 'NASDAQ' },
      '/ratios-ttm': {
        priceToEarningsRatioTTM: 20,
        priceToSalesRatioTTM: 6,
        priceToBookRatioTTM: 8,
        netProfitMarginTTM: 0.2,
        grossProfitMarginTTM: 0.4,
        dividendYieldTTM: 0.05,
        dividendPayoutRatioTTM: 0.3,
        debtToEquityRatioTTM: 1.2,
      },
      '/key-metrics-ttm': { evToEBITDATTM: 12, freeCashFlowYieldTTM: 0.04, returnOnEquityTTM: 0.25, netDebtToEBITDATTM: 2 },
    })
    const fetcher = new CarteiraMetricsFetcher(client, clock)

    const m = await fetcher.fetchStock('AAPL', false)

    expect(m.price).toBe(100)
    expect(m.change).toBe(2.5)
    expect(m.perf12m).toBe(100) // (100-50)/50*100
    expect(m.pe).toBe(20)
    expect(m.ps).toBe(6)
    expect(m.pb).toBe(8)
    expect(m.evEbitda).toBe(12)
    expect(m.fcfYield).toBe(4)
    expect(m.roe).toBe(25)
    expect(m.netMargin).toBe(20)
    expect(m.grossMarginTTM).toBe(40)
    expect(m.dividendYield).toBe(5)
    expect(m.payoutRatio).toBe(30)
    expect(m.debtEquity).toBe(1.2)
    expect(m.debtEbitda).toBe(2)
    expect(m.currency).toBe('USD')
    expect(m.exchange).toBe('NASDAQ')
    expect(m.updated).toBe('2026-05-06T07:08:09.000Z')

    expect(calls.map((c) => c.path)).toEqual(['/profile', '/ratios-ttm', '/key-metrics-ttm'])
    expect(calls[0].params).toEqual({ symbol: 'AAPL' })
  })
})

describe('CarteiraMetricsFetcher.fetchStock (REIT)', () => {
  it('computes FFO metrics from income and cash-flow statements', async () => {
    const { client, calls } = clientReturning({
      '/profile': { price: 100, range: '80-120', currency: 'USD', exchangeShortName: 'NYSE' },
      '/ratios-ttm': {},
      '/key-metrics-ttm': {},
      '/income-statement': { netIncome: 1000, depreciationAndAmortization: 500, weightedAverageShsOut: 100 },
      '/cash-flow-statement': { netDividendsPaid: -300 },
    })
    const fetcher = new CarteiraMetricsFetcher(client, clock)

    const m = await fetcher.fetchStock('O', true)

    // ffo = 1500, ffoPs = 15 -> pFfo = 100/15 = 6.67, ffoYield = 15, payout = 300/1500 = 20
    expect(m.pFfo).toBe(6.67)
    expect(m.ffoYield).toBe(15)
    expect(m.ffoPayoutRatio).toBe(20)
    expect(calls.map((c) => c.path)).toContain('/income-statement')
    expect(calls.map((c) => c.path)).toContain('/cash-flow-statement')
  })
})

describe('CarteiraMetricsFetcher.fetchEtf', () => {
  it('maps the ETF profile and dividend yield only', async () => {
    const { client, calls } = clientReturning({
      '/profile': { price: 400, changePercentage: 1, range: '300-450', currency: 'USD', exchange: 'ARCA' },
      '/ratios-ttm': { dividendYieldTTM: 0.015 },
    })
    const fetcher = new CarteiraMetricsFetcher(client, clock)

    const m = await fetcher.fetchEtf('VOO')

    expect(m.price).toBe(400)
    expect(m.change).toBe(1)
    expect(m.perf12m).toBe(33.33) // (400-300)/300*100
    expect(m.dividendYield).toBe(1.5)
    expect(m.exchange).toBe('ARCA')
    expect(m.updated).toBe('2026-05-06T07:08:09.000Z')
    expect(calls.map((c) => c.path)).toEqual(['/profile', '/ratios-ttm'])
  })
})

describe('CarteiraMetricsFetcher.fetchCrypto', () => {
  it('maps the quote, computes perf from year low, and fixes currency/exchange', async () => {
    const { client, calls } = clientReturning({ '/quote': { price: 50000, changePercentage: 3, yearLow: 25000 } })
    const fetcher = new CarteiraMetricsFetcher(client, clock)

    const m = await fetcher.fetchCrypto('BTCUSD')

    expect(m.price).toBe(50000)
    expect(m.change).toBe(3)
    expect(m.perf12m).toBe(100) // (50000-25000)/25000*100
    expect(m.dividendYield).toBeNull()
    expect(m.currency).toBe('USD')
    expect(m.exchange).toBe('Cripto')
    expect(calls[0]).toEqual({ path: '/quote', params: { symbol: 'BTCUSD' } })
  })
})

describe('CarteiraMetricsFetcher.fetchItem routing', () => {
  const item = (over: Partial<CarteiraItem>): CarteiraItem => ({ ticker: 'X', name: 'n', type: 'growth', sector: 's', kind: 'stock', ...over })

  it('routes crypto to the quote endpoint', async () => {
    const { client, calls } = clientReturning({ '/quote': { price: 1 } })
    await new CarteiraMetricsFetcher(client, clock).fetchItem(item({ ticker: 'ETHUSD', kind: 'crypto' }))
    expect(calls.map((c) => c.path)).toEqual(['/quote'])
  })

  it('routes fund to the ETF endpoints', async () => {
    const { client, calls } = clientReturning({ '/profile': { price: 1 }, '/ratios-ttm': {} })
    await new CarteiraMetricsFetcher(client, clock).fetchItem(item({ ticker: 'SPY', kind: 'fund' }))
    expect(calls.map((c) => c.path)).toEqual(['/profile', '/ratios-ttm'])
  })

  it('routes a reit-typed stock through the REIT statements', async () => {
    const { client, calls } = clientReturning({ '/profile': { price: 1 }, '/ratios-ttm': {}, '/key-metrics-ttm': {} })
    await new CarteiraMetricsFetcher(client, clock).fetchItem(item({ ticker: 'O', kind: 'stock', type: 'reit' }))
    expect(calls.map((c) => c.path)).toContain('/income-statement')
  })
})

describe('CarteiraMetricsFetcher — known debt', () => {
  it('DEBT: a total FMP outage (client returns null) yields empty metrics without throwing', async () => {
    // The client turns every FMP failure into null and the fetcher maps that to
    // a fully-null metrics object, never throwing. So a complete outage is
    // reported by refresh as errors:0 / itemCount:730. This is pinned as known
    // debt on purpose — fixing the semantic (distinguish "no data" from
    // "unavailable") is a separate commit, not this characterization.
    const { client } = clientReturning({}) // every path -> null
    const fetcher = new CarteiraMetricsFetcher(client, clock)

    const m = await fetcher.fetchStock('AAPL', false)

    expect(m.price).toBeNull()
    expect(m.change).toBeNull()
    expect(m.pe).toBeNull()
    expect(m.updated).toBe('2026-05-06T07:08:09.000Z') // still produced, not an error
  })
})
