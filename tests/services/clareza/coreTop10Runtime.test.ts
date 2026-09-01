import { createCoreTop10Runtime } from '../../../src/services/clareza/core/coreTop10Runtime'
import type { CoreGenerationCandidate } from '../../../src/services/clareza/core/coreGeneration.types'

const generation: CoreGenerationCandidate = {
  generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
  createdAt: new Date('2026-09-02T03:00:00.000Z'),
  records: [{ ticker: 'ASML.AS', kind: 'stock', datasets: { data: { price: 900, grossMarginTTM: 51 } } }],
}

describe('canonical core Top 10 runtime', () => {
  it('serves flat core data plus history from the exact matching generation', async () => {
    const runtime = createCoreTop10Runtime({
      generationStore: { readPublished: async () => generation },
      companionStore: { read: async () => ({
        generationId: 'generation-a', createdAt: new Date('2026-09-02T03:05:00.000Z'),
        histories: [{ ticker: 'ASML.AS', points: [{ date: '2026-09-01', close: 890 }] }], errors: [],
      }), replace: async () => undefined },
      universe: [{ ticker: 'ASML.AS', name: 'ASML', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' }],
      selections: [{ key: 'ASML', canonicalTicker: 'ASML.AS', currency: '€' }],
      revision: 'Q2 2026',
    })

    await expect(runtime.read()).resolves.toMatchObject({
      generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
      updated: '2026-09-02T03:05:00.000Z', source: 'Clareza (cérebro + universo partilhados)',
      stocks: { ASML: { price: 900, grossMargin: 51, currency: '€', historical: [{ date: '2026-09-01', close: 890 }] } },
      coverage: { selected: 1, available: 1, missing: [] },
    })
  })
})
