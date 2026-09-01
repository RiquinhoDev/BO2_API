import type { CoreGenerationStore } from '../../../src/services/clareza/core/coreGeneration.types'
import { createCorePublishedRuntime } from '../../../src/services/clareza/core/corePublishedRuntime'

const generation = {
  generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
  createdAt: new Date('2026-09-01T12:00:00.000Z'),
  records: [
    { ticker: 'AAPL', kind: 'stock' as const, datasets: {
      data: { price: 200 }, evaluation: { valuation: { score: 72 } },
      'annual-income': [{ date: '2025-12-31', revenue: 100 }],
      earnings: [{ date: '2026-07-31', epsActual: 2.1 }],
    } },
    { ticker: 'BTC-USD', kind: 'crypto' as const, datasets: { data: { price: 60000 } } },
  ],
}

const universe = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, bucket: 'growth' as const, sector: 'Technology' },
  { ticker: 'BTC-USD', name: 'Bitcoin', kind: 'crypto' as const, type: 'cripto' as const, bucket: 'cripto' as const, sector: 'Cripto' },
]

function store(): CoreGenerationStore {
  return {
    readPublished: jest.fn().mockResolvedValue(generation),
    createCandidate: jest.fn(), readCandidate: jest.fn(), publishCandidate: jest.fn(),
    rollback: jest.fn(), retainCandidates: jest.fn(),
  } as unknown as CoreGenerationStore
}

describe('published Clareza core runtime', () => {
  it('serves Radar and Carteira from the same immutable generation', async () => {
    const runtime = createCorePublishedRuntime({ store: store(), universe })

    const [radar, carteira] = await Promise.all([runtime.radar(), runtime.carteira()])

    expect(radar).toMatchObject({ generationId: 'generation-a', count: 1 })
    expect(radar.stocks[0]).toMatchObject({ ticker: 'AAPL', data: { price: 200 }, evaluation: { valuation: { score: 72 } } })
    expect(carteira).toMatchObject({ generationId: 'generation-a', count: 2 })
    expect(carteira.items.map(item => item.ticker)).toEqual(['AAPL', 'BTC-USD'])
  })

  it('returns bounded history only for requested known symbols without provider I/O', async () => {
    const runtime = createCorePublishedRuntime({ store: store(), universe })

    await expect(runtime.portfolioAnalysis(' aapl,missing,aapl ')).resolves.toEqual({
      generationId: 'generation-a',
      results: {
        AAPL: {
          income: [{ date: '2025-12-31', revenue: 100 }],
          incomeGrowth: [],
          earnings: [{ date: '2026-07-31', epsActual: 2.1 }],
        },
      },
      missing: ['MISSING'],
    })
  })

  it('rejects an empty or oversized symbol request', async () => {
    const runtime = createCorePublishedRuntime({ store: store(), universe })
    await expect(runtime.portfolioAnalysis('')).rejects.toThrow('at least one symbol')
    await expect(runtime.portfolioAnalysis(Array.from({ length: 51 }, (_, index) => `S${index}`).join(',')))
      .rejects.toThrow('at most 50 symbols')
  })
})
