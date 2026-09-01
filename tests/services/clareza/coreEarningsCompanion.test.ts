import { CoreEarningsCompanionCollector } from '../../../src/services/clareza/core/coreEarningsCompanionCollector'
import { createCoreEarningsCompanionRefresh } from '../../../src/services/clareza/core/coreEarningsCompanionRefresh'

const universe = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, bucket: 'growth' as const, sector: 'Technology' },
  { ticker: 'O', name: 'Realty Income', kind: 'stock' as const, type: 'reit' as const, bucket: 'reit' as const, sector: 'Real Estate' },
  { ticker: 'VWCE.DE', name: 'Vanguard', kind: 'fund' as const, type: 'etf' as const, bucket: 'etf' as const, sector: 'ETF' },
]

describe('core Earnings companion', () => {
  it('collects only the exclusive earnings dataset for stocks and REITs', async () => {
    const calls: Array<{ path: string; params: Readonly<Record<string, string>> }> = []
    const collector = new CoreEarningsCompanionCollector({
      get: async (path, params) => {
        calls.push({ path, params })
        return [{ date: '2026-10-01', epsEstimated: 2 }]
      },
    }, universe, { concurrency: 2, now: () => new Date('2026-09-02T03:00:00.000Z') })

    const result = await collector.collect('generation-a')
    expect(calls).toEqual([
      { path: '/earnings', params: { symbol: 'AAPL', limit: '8' } },
      { path: '/earnings', params: { symbol: 'O', limit: '8' } },
    ])
    expect(result.series).toHaveLength(2)
    expect(result.errors).toEqual([])
  })

  it('is idempotent for an already completed generation', async () => {
    const existing = { generationId: 'generation-a', createdAt: new Date(), series: [{ ticker: 'AAPL', events: [] }], errors: [] }
    const store = { read: jest.fn().mockResolvedValue(existing), replace: jest.fn() }
    const collector = { collect: jest.fn() }
    const refresh = createCoreEarningsCompanionRefresh({ store, collector })

    await expect(refresh('generation-a')).resolves.toEqual({ total: 1, errors: 0 })
    expect(collector.collect).not.toHaveBeenCalled()
    expect(store.replace).not.toHaveBeenCalled()
  })
})
