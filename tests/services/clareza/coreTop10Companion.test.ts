import { CoreTop10CompanionCollector } from '../../../src/services/clareza/core/coreTop10CompanionCollector'
import { createCoreTop10CompanionRefresh } from '../../../src/services/clareza/core/coreTop10CompanionRefresh'
import { CORE_TOP10_SELECTIONS } from '../../../src/services/clareza/core/coreTop10Selection'
import { CLAREZA_UNIVERSE } from '../../../src/services/clareza/universe/clarezaUniverse.catalog'

describe('core Top 10 companion', () => {
  const selections = [
    { key: 'ASML', canonicalTicker: 'ASML.AS', currency: '€' },
    { key: 'SPCX', canonicalTicker: 'SPCX', currency: '$' },
  ]

  it('keeps the ten PHP editorial identities resolvable in the canonical universe', () => {
    expect(CORE_TOP10_SELECTIONS.map(item => `${item.key}:${item.canonicalTicker}`)).toEqual([
      'MU:MU', 'GOOGL:GOOGL', 'TSM:TSM', 'NVDA:NVDA', 'PLTR:PLTR',
      'ASML:ASML.AS', 'META:META', 'FERRARI:RACE.MI', 'NBIS:NBIS', 'SPCX:SPCX',
    ])
    const known = new Set(CLAREZA_UNIVERSE.map(asset => asset.ticker))
    expect(CORE_TOP10_SELECTIONS.every(item => known.has(item.canonicalTicker))).toBe(true)
  })

  it('collects only five-year price history for editorial selections', async () => {
    const calls: Array<{ path: string; params: Readonly<Record<string, string>> }> = []
    const collector = new CoreTop10CompanionCollector({
      get: async (path, params) => {
        calls.push({ path, params })
        return [{ date: '2026-09-01', price: 10 }]
      },
    }, selections, { concurrency: 2, now: () => new Date('2026-09-02T03:00:00.000Z') })

    const result = await collector.collect('generation-a')
    expect(calls).toEqual([
      { path: '/historical-price-eod/light', params: { symbol: 'ASML.AS', from: '2021-09-02', to: '2026-09-02' } },
      { path: '/historical-price-eod/light', params: { symbol: 'SPCX', from: '2021-09-02', to: '2026-09-02' } },
    ])
    expect(result.histories).toEqual([
      { ticker: 'ASML.AS', points: [{ date: '2026-09-01', close: 10 }] },
      { ticker: 'SPCX', points: [{ date: '2026-09-01', close: 10 }] },
    ])
  })

  it('makes zero provider calls for an already completed generation', async () => {
    const existing = { generationId: 'generation-a', createdAt: new Date(), histories: [], errors: [] }
    const store = { read: jest.fn().mockResolvedValue(existing), replace: jest.fn() }
    const collector = { collect: jest.fn() }
    const refresh = createCoreTop10CompanionRefresh({ store, collector })
    await expect(refresh('generation-a')).resolves.toEqual({ total: 0, errors: 0 })
    expect(collector.collect).not.toHaveBeenCalled()
  })
})
