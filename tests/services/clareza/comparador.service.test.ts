import {
  createComparadorService,
  type ComparadorService,
} from '../../../src/services/clareza/comparador/comparador.service'
import type { ComparadorFmpPort } from '../../../src/services/clareza/comparador/comparadorFmpClient'
import type { ComparadorStorePort } from '../../../src/services/clareza/comparador/comparadorStore'
import type { ComparadorSnapshot, ComparadorStock } from '../../../src/services/clareza/comparador/comparador.types'
import { IntegrationUnavailableError } from '../../../src/errors/integrationUnavailableError'

function stock(ticker: string): ComparadorStock {
  return {
    ticker,
    name: `${ticker} Company`,
    image: null,
    sector: null,
    industry: null,
    country: null,
    currency: 'USD',
    exchange: null,
    isReit: false,
    price: 100,
    change: null,
    perf12m: null,
    marketCap: null,
    beta: null,
    pe: null,
    peg: null,
    ps: null,
    pb: null,
    evEbitda: null,
    pFfo: null,
    grossMargin: null,
    netMargin: null,
    roe: null,
    roic: null,
    fcfYield: null,
    debtEquity: null,
    debtEbitda: null,
    dividendYield: null,
    payoutRatio: null,
    ffoPayout: null,
    analystConsensus: null,
    strongBuy: null,
    buy: null,
    hold: null,
    sell: null,
    strongSell: null,
    targetConsensus: null,
    upside: null,
    updated: '2026-08-11T09:30:00.000Z',
  }
}

class FakeStore implements ComparadorStorePort {
  readonly writes: Array<{ readonly snapshot: ComparadorSnapshot; readonly errors: number }> = []
  readCalls = 0

  constructor(private snapshot: ComparadorSnapshot | null) {}

  async read(): Promise<ComparadorSnapshot | null> {
    this.readCalls += 1
    return this.snapshot
  }

  async write(snapshot: ComparadorSnapshot, errors: number): Promise<void> {
    this.writes.push({ snapshot, errors })
    this.snapshot = snapshot
  }
}

class ScriptedFmp implements ComparadorFmpPort {
  readonly calls: string[] = []
  active = 0
  maxActive = 0

  constructor(private readonly fetch: (ticker: string) => Promise<ComparadorStock | null>) {}

  async fetchCompany(ticker: string): Promise<ComparadorStock | null> {
    this.calls.push(ticker)
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      return await this.fetch(ticker)
    } finally {
      this.active -= 1
    }
  }
}

function service(
  store: FakeStore,
  fmp: ScriptedFmp,
  options: Partial<{ readonly universe: readonly string[]; readonly concurrency: number }> = {},
): ComparadorService {
  return createComparadorService({
    store,
    fmp,
    universe: options.universe ?? ['AAPL', 'MSFT', 'NVDA'],
    concurrency: options.concurrency ?? 2,
    now: () => '2026-08-11T12:00:00.000Z',
    assertFmpAvailable: () => undefined,
  })
}

describe('ComparadorService', () => {
  it('serves comparison and search reads exclusively from the snapshot store', async () => {
    const store = new FakeStore({
      updated: '2026-08-11T09:30:00.000Z',
      stocks: { AAPL: { ...stock('AAPL'), name: 'Apple Inc.' } },
    })
    const fmp = new ScriptedFmp(async (ticker) => stock(ticker))
    const subject = service(store, fmp)

    await expect(subject.getComparadorSymbols('AAPL,MSFT')).resolves.toMatchObject({ count: 2 })
    await expect(subject.searchComparador('apple')).resolves.toMatchObject({ count: 1 })

    expect(store.readCalls).toBe(2)
    expect(fmp.calls).toEqual([])
  })

  it('bounds refresh work, timestamps it with the injected clock, and persists only after every ticker settles', async () => {
    const store = new FakeStore(null)
    const resolvers = new Map<string, () => void>()
    const fmp = new ScriptedFmp((ticker) => new Promise((resolve) => {
      resolvers.set(ticker, () => resolve(stock(ticker)))
    }))
    const subject = service(store, fmp, { universe: ['A', 'B', 'C'], concurrency: 2 })

    const refresh = subject.refreshClarezaComparadorData()
    await Promise.resolve()

    expect(fmp.calls).toEqual(['A', 'B'])
    expect(fmp.maxActive).toBe(2)
    expect(store.writes).toEqual([])

    resolvers.get('A')?.()
    resolvers.get('B')?.()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(fmp.calls).toEqual(['A', 'B', 'C'])
    expect(store.writes).toEqual([])

    resolvers.get('C')?.()

    await expect(refresh).resolves.toEqual({ total: 3, errors: 0 })
    expect(store.writes).toEqual([{
      errors: 0,
      snapshot: {
        updated: '2026-08-11T12:00:00.000Z',
        stocks: { A: stock('A'), B: stock('B'), C: stock('C') },
      },
    }])
  })

  it('fails refresh with the typed unavailable-integration error before calling FMP', async () => {
    const store = new FakeStore(null)
    const fmp = new ScriptedFmp(async (ticker) => stock(ticker))
    const unavailable = createComparadorService({
      store,
      fmp,
      universe: ['AAPL'],
      concurrency: 1,
      now: () => '2026-08-11T12:00:00.000Z',
      assertFmpAvailable: () => { throw new IntegrationUnavailableError('fmp') },
    })

    await expect(unavailable.refreshClarezaComparadorData()).rejects.toBeInstanceOf(IntegrationUnavailableError)
    expect(fmp.calls).toEqual([])
    expect(store.writes).toEqual([])
  })
  it('reports partial failures in requested order and merges only successful manual refreshes', async () => {
    const oldMsft = { ...stock('MSFT'), price: 10 }
    const store = new FakeStore({
      updated: '2026-08-11T09:30:00.000Z',
      stocks: { AAPL: stock('AAPL'), MSFT: oldMsft, NVDA: stock('NVDA') },
    })
    const fmp = new ScriptedFmp(async (ticker) => {
      if (ticker === 'MSFT') return null
      return { ...stock(ticker), price: 200 }
    })
    const subject = service(store, fmp)

    await expect(subject.refreshComparadorSymbols(' aapl,msft,goog ')).resolves.toEqual({
      ok: true,
      updated: ['AAPL', 'GOOG'],
      failed: ['MSFT'],
    })

    expect(fmp.calls).toEqual(['AAPL', 'MSFT', 'GOOG'])
    expect(store.writes).toEqual([{
      errors: 1,
      snapshot: {
        updated: '2026-08-11T12:00:00.000Z',
        stocks: {
          AAPL: { ...stock('AAPL'), price: 200 },
          MSFT: oldMsft,
          NVDA: stock('NVDA'),
          GOOG: { ...stock('GOOG'), price: 200 },
        },
      },
    }])
  })
})
