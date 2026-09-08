import { createCoreComparadorRuntime } from '../../../src/services/clareza/core/coreComparadorRuntime'
import type { CoreGenerationCandidate } from '../../../src/services/clareza/core/coreGeneration.types'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

const universe: readonly ClarezaAsset[] = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
  { ticker: 'ABT', name: 'Abbott', kind: 'stock', type: 'value', bucket: 'value', sector: 'Healthcare' },
  { ticker: 'ARE', name: 'Alexandria', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate' },
]
const generation: CoreGenerationCandidate = {
  generationId: 'generation-a', universeVersion: 'u', dataVersion: 'd', createdAt: new Date(),
  records: universe.map(asset => ({
    ticker: asset.ticker, kind: asset.kind,
    datasets: { data: { price: asset.ticker === 'ABT' ? null : 200, grossMarginTTM: 50 }, evaluation: { verdict: 'fair' } },
  })),
}

describe('canonical core Comparador runtime', () => {
  const store = {
    read: async () => ({
      generationId: 'generation-a', sectorPe: [], companions: { AAPL: {
        gradesConsensus: { consensus: 'Buy', strongBuy: 10 },
        priceTargetConsensus: { targetConsensus: 240 }, updated: '2026-09-02T04:00:00.000Z',
      } as never },
    }),
    replace: async () => undefined,
  }

  it('compares from one published generation and its matching consensus companion', async () => {
    const runtime = createCoreComparadorRuntime({
      generationStore: { readPublished: async () => generation }, companionStore: store, universe,
    })

    await expect(runtime.compare('AAPL,ARE,MISSING')).resolves.toMatchObject({
      generationId: 'generation-a', count: 1,
      companies: [{ ticker: 'AAPL', grossMargin: 50, analystConsensus: 'Buy', targetConsensus: 240 }],
      rejected: [
        { ticker: 'ARE', reason: 'ineligible-kind' },
        { ticker: 'MISSING', reason: 'unknown-symbol' },
      ],
    })
  })

  it('searches only eligible companies with real price and PHP ranking/count limits', async () => {
    const many = Array.from({ length: 25 }, (_, index): ClarezaAsset => ({
      ticker: `APP${String(index).padStart(2, '0')}`, name: `Apple Match ${index}`,
      kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology',
    }))
    const assets = [...universe, ...many]
    const current = { ...generation, records: assets.map(asset => ({
      ticker: asset.ticker, kind: asset.kind,
      datasets: { data: { price: asset.ticker === 'ABT' ? null : 1 }, evaluation: null },
    })) }
    const runtime = createCoreComparadorRuntime({
      generationStore: { readPublished: async () => current }, companionStore: store, universe: assets,
    })

    const result = await runtime.search('app')
    expect(result.count).toBe(26)
    expect(result.results).toHaveLength(20)
    expect(result.results[0]).toMatchObject({ symbol: 'APP00', type: 'growth' })
    expect(result.results.some(item => item.symbol === 'ARE')).toBe(false)
  })
})
