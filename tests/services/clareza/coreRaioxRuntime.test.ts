import { createCoreRaioxRuntime } from '../../../src/services/clareza/core/coreRaioxRuntime'
import type { CoreGenerationCandidate } from '../../../src/services/clareza/core/coreGeneration.types'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

const universe: readonly ClarezaAsset[] = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
  { ticker: 'ABT', name: 'Abbott', kind: 'stock', type: 'value', bucket: 'value', sector: 'Healthcare' },
  { ticker: 'ARE', name: 'Alexandria', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate' },
  { ticker: 'VUSA.L', name: 'Vanguard S&P 500', kind: 'fund', type: 'etf', bucket: 'etf', sector: 'ETF' },
]
const generation: CoreGenerationCandidate = {
  generationId: 'generation-a', universeVersion: 'u', dataVersion: 'd',
  createdAt: new Date('2026-09-02T03:00:00.000Z'),
  records: universe.map(asset => ({
    ticker: asset.ticker, kind: asset.kind,
    datasets: { data: { price: asset.ticker === 'AAPL' ? 200 : 100, currency: 'USD', exchange: 'NASDAQ' }, evaluation: { verdict: { key: 'fair' } } },
  })),
}

describe('canonical core Raio-X runtime', () => {
  it('composes one stock exclusively from the published generation and its matching companion', async () => {
    const runtime = createCoreRaioxRuntime({
      generationStore: { readPublished: async () => generation },
      companionStore: { replace: async () => undefined, read: async generationId => ({
        generationId, sectorPe: [{ sector: 'Technology', pe: 25 }],
        companions: { AAPL: {
          profileExtra: { country: 'US' }, forwardPe: 22,
          annualIncome: [], annualCashFlow: [], quarterlyIncome: [], quarterlyCashFlow: [],
          annualRatios: [], gradesConsensus: {}, priceTargetConsensus: {}, earnings: [],
          dividends: [], peerRatios: {}, momentum: null, segmentation: [],
          updated: '2026-09-02T03:30:00.000Z',
        } },
      }) },
      universe,
    })

    await expect(runtime.asset('aapl')).resolves.toMatchObject({
      generationId: 'generation-a', ticker: 'AAPL',
      p: { companyName: 'Apple', country: 'US', price: 200 },
      evaluation: { verdict: { key: 'fair' } },
      sectorPe: [{ sector: 'Technology', pe: 25 }],
    })
  })

  it('searches only non-REIT stocks with PHP ranking and count-before-limit semantics', async () => {
    const many = Array.from({ length: 30 }, (_, index): ClarezaAsset => ({
      ticker: `APP${String(index).padStart(2, '0')}`, name: `Apple Match ${index}`,
      kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology',
    }))
    const assets = [...universe, ...many]
    const published = { ...generation, records: assets.map(asset => ({
      ticker: asset.ticker, kind: asset.kind, datasets: { data: { price: 1 }, evaluation: null },
    })) }
    const runtime = createCoreRaioxRuntime({
      generationStore: { readPublished: async () => published },
      companionStore: { read: async () => null, replace: async () => undefined }, universe: assets,
    })

    const result = await runtime.search('app')
    expect(result.count).toBe(31)
    expect(result.results).toHaveLength(25)
    expect(result.results[0]).toMatchObject({ symbol: 'APP00', name: 'Apple Match 0' })
    expect(result.results.some(item => item.symbol === 'ARE')).toBe(false)
    expect(result.results.some(item => item.symbol === 'VUSA.L')).toBe(false)
  })

  it('never falls back to a companion from a different generation', async () => {
    const read = jest.fn(async () => null)
    const runtime = createCoreRaioxRuntime({
      generationStore: { readPublished: async () => generation },
      companionStore: { read, replace: async () => undefined }, universe,
    })

    await expect(runtime.asset('AAPL')).resolves.toMatchObject({
      generationId: 'generation-a', companion_updated: null,
      complementCoverage: { annualIncome: 'missing' },
    })
    expect(read).toHaveBeenCalledWith('generation-a')
  })
})
