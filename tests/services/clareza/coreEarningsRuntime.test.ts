import { createCoreEarningsRuntime } from '../../../src/services/clareza/core/coreEarningsRuntime'
import type { CoreGenerationCandidate } from '../../../src/services/clareza/core/coreGeneration.types'

const generation: CoreGenerationCandidate = {
  generationId: 'generation-a', universeVersion: 'u1', dataVersion: 'd1',
  createdAt: new Date('2026-09-02T03:00:00.000Z'),
  records: [
    { ticker: 'AAPL', kind: 'stock', datasets: { data: { currency: 'USD' } } },
    { ticker: 'O', kind: 'stock', datasets: { data: { currency: 'USD' } } },
  ],
}

describe('canonical core Earnings runtime', () => {
  it('serves the exact PHP/HTML document from one generation and matching companion', async () => {
    const runtime = createCoreEarningsRuntime({
      generationStore: { readPublished: async () => generation },
      companionStore: { read: async () => ({
        generationId: 'generation-a', createdAt: new Date('2026-09-02T03:05:00.000Z'),
        series: [
          { ticker: 'AAPL', events: [{ date: '2026-10-01', epsEstimated: 2 }] },
          { ticker: 'O', events: [{ date: '2026-11-01', epsEstimated: 1 }] },
        ], errors: [],
      }), replace: async () => undefined },
      universe: [
        { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
        { ticker: 'O', name: 'Realty Income', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate' },
      ],
      now: () => new Date('2026-09-02T12:00:00.000Z'),
    })

    await expect(runtime.read()).resolves.toMatchObject({
      generationId: 'generation-a', universeVersion: 'u1', dataVersion: 'd1',
      updated: '2026-09-02T03:05:00.000Z',
      window: { from: '2026-09-02', to: '2026-12-31' }, count: 2,
      earnings: [
        { t: 'AAPL', n: 'Apple', type: 'stock' },
        { t: 'O', n: 'Realty Income', type: 'reit' },
      ],
      coverage: { eligible: 2, available: 2, missing: [] },
    })
  })
})
