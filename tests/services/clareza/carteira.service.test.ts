import { ClarezaCarteiraService } from '../../../src/services/clareza/carteira/carteira.service'
import type { CarteiraStore } from '../../../src/services/clareza/carteira/carteiraStore'
import type { CarteiraMetricsFetcher } from '../../../src/services/clareza/carteira/carteiraMetrics'
import type { CarteiraItem } from '../../../src/services/clareza/carteira/carteiraUniverse'
import type { IClarezaCarteiraItem, IClarezaCarteiraMetrics } from '../../../src/models/ClarezaCarteiraData'

const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') }

function metrics(currency: string | null): IClarezaCarteiraMetrics {
  return { price: 1, change: 0, perf12m: 0, dividendYield: 0, currency, exchange: 'X', updated: 'now' }
}

function makeStore(overrides: Partial<CarteiraStore> = {}): jest.Mocked<CarteiraStore> {
  return {
    readCache: jest.fn().mockResolvedValue(null),
    writeCache: jest.fn().mockResolvedValue(undefined),
    saveSnapshot: jest.fn().mockResolvedValue(undefined),
    latestSnapshot: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as jest.Mocked<CarteiraStore>
}

const universe: CarteiraItem[] = [
  { ticker: 'AAA', name: 'Alpha', type: 'growth', sector: 'Tech', kind: 'stock' },
  { ticker: 'BBB', name: 'Beta', type: 'etf', sector: 'Broad', kind: 'fund' },
]

const config = { fmpConfigured: true, cacheTtl: 100, concurrency: 2 }

function makeFetcher(fetchItem: jest.Mock): Pick<CarteiraMetricsFetcher, 'fetchItem'> {
  return { fetchItem } as unknown as Pick<CarteiraMetricsFetcher, 'fetchItem'>
}

describe('ClarezaCarteiraService.refresh', () => {
  it('is fail-closed when FMP is not configured and never touches the store', async () => {
    const store = makeStore()
    const service = new ClarezaCarteiraService(makeFetcher(jest.fn()), store, universe, clock, { ...config, fmpConfigured: false })

    await expect(service.refresh()).rejects.toThrow('FMP_API_KEY nao configurada')
    expect(store.writeCache).not.toHaveBeenCalled()
    expect(store.saveSnapshot).not.toHaveBeenCalled()
  })

  it('fetches every item, caches, snapshots, and reports counts', async () => {
    const store = makeStore()
    const fetchItem = jest.fn().mockResolvedValue(metrics('USD'))
    const service = new ClarezaCarteiraService(makeFetcher(fetchItem), store, universe, clock, config)

    const result = await service.refresh()

    expect(result).toEqual({ total: 2, errors: 0 })
    expect(fetchItem).toHaveBeenCalledTimes(2)
    const cached = store.writeCache.mock.calls[0][0] as IClarezaCarteiraItem[]
    expect(cached.map((i) => i.ticker)).toEqual(['AAA', 'BBB'])
    expect(store.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2, errors: 0, fetchedAt: new Date('2026-01-01T00:00:00.000Z') }),
    )
  })

  it('counts a failed item and stores it with null data', async () => {
    const store = makeStore()
    const fetchItem = jest
      .fn()
      .mockResolvedValueOnce(metrics('USD'))
      .mockRejectedValueOnce(new Error('boom'))
    const service = new ClarezaCarteiraService(makeFetcher(fetchItem), store, universe, clock, config)

    const result = await service.refresh()

    expect(result).toEqual({ total: 2, errors: 1 })
    const cached = store.writeCache.mock.calls[0][0] as IClarezaCarteiraItem[]
    expect(cached.find((i) => i.ticker === 'BBB')?.data).toBeNull()
  })
})

describe('ClarezaCarteiraService.getData', () => {
  it('returns the cache when present without reading the snapshot', async () => {
    const cache = [{ ticker: 'AAA', name: 'Alpha', type: 'growth', kind: 'stock', sector: 'Tech', data: metrics('USD') }]
    const store = makeStore({ readCache: jest.fn().mockResolvedValue(cache) })
    const service = new ClarezaCarteiraService(makeFetcher(jest.fn()), store, universe, clock, config)

    expect(await service.getData()).toBe(cache)
    expect(store.latestSnapshot).not.toHaveBeenCalled()
  })

  it('falls back to the latest snapshot and warms the cache', async () => {
    const items = [{ ticker: 'AAA', name: 'Alpha', type: 'growth', kind: 'stock', sector: 'Tech', data: metrics('USD') }]
    const store = makeStore({ latestSnapshot: jest.fn().mockResolvedValue({ fetchedAt: new Date(), items }) })
    const service = new ClarezaCarteiraService(makeFetcher(jest.fn()), store, universe, clock, config)

    expect(await service.getData()).toBe(items)
    expect(store.writeCache).toHaveBeenCalledWith(items, 100)
  })

  it('returns null with neither cache nor snapshot', async () => {
    const service = new ClarezaCarteiraService(makeFetcher(jest.fn()), makeStore(), universe, clock, config)
    expect(await service.getData()).toBeNull()
  })
})

describe('ClarezaCarteiraService.search', () => {
  const items: IClarezaCarteiraItem[] = [
    { ticker: 'AAA', name: 'Alpha', type: 'growth', kind: 'stock', sector: 'Tech', data: metrics('USD') },
    { ticker: 'AAB', name: 'Alphabet', type: 'growth', kind: 'stock', sector: 'Tech', data: metrics('EUR') },
    { ticker: 'ZZZ', name: 'Zeta', type: 'etf', kind: 'fund', sector: 'Broad', data: metrics(null) },
  ]
  const service = () =>
    new ClarezaCarteiraService(makeFetcher(jest.fn()), makeStore({ readCache: jest.fn().mockResolvedValue(items) }), universe, clock, config)

  it('matches an exact ticker only and carries its currency', async () => {
    const res = await service().search('AAA')
    expect(res.results.map((r) => r.ticker)).toEqual(['AAA'])
    expect(res.results[0]).toMatchObject({ ticker: 'AAA', currency: 'USD', kind: 'stock' })
    expect(res.count).toBe(1)
  })

  it('orders prefix matches by rank then ticker', async () => {
    const res = await service().search('AA')
    expect(res.results.map((r) => r.ticker)).toEqual(['AAA', 'AAB'])
    expect(res.count).toBe(2)
  })

  it('returns everything for an empty query', async () => {
    const res = await service().search('')
    expect(res.count).toBe(3)
    expect(res.query).toBe('')
  })

  it('caps results at 25', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ticker: `T${String(i).padStart(2, '0')}`,
      name: `Name ${i}`,
      type: 'growth',
      kind: 'stock' as const,
      sector: 'Tech',
      data: metrics('USD'),
    }))
    const svc = new ClarezaCarteiraService(makeFetcher(jest.fn()), makeStore({ readCache: jest.fn().mockResolvedValue(many) }), universe, clock, config)
    const res = await svc.search('')
    expect(res.results).toHaveLength(25)
  })
})
