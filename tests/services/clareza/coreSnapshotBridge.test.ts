import type { CoreGenerationCandidate, CoreGenerationStore } from '../../../src/services/clareza/core/coreGeneration.types'
import { publishCarteiraSnapshot } from '../../../src/services/clareza/core/coreSnapshotBridge'

describe('Carteira to core snapshot bridge', () => {
  it('creates and atomically publishes a complete immutable universe generation', async () => {
    let created: CoreGenerationCandidate | null = null
    const store = {
      readPublished: jest.fn().mockResolvedValue({ generationId: 'previous' }),
      createCandidate: jest.fn(async candidate => { created = candidate }),
      publishCandidate: jest.fn().mockResolvedValue({
        status: 'published', currentGenerationId: 'new', previousGenerationId: 'previous', revision: 2,
      }),
    } as unknown as CoreGenerationStore
    const universe = [
      { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, bucket: 'growth' as const, sector: 'Technology' },
      { ticker: 'BTC-USD', name: 'Bitcoin', kind: 'crypto' as const, type: 'cripto' as const, bucket: 'cripto' as const, sector: 'Cripto' },
    ]

    const result = await publishCarteiraSnapshot({
      items: [{ ticker: 'AAPL', name: 'Apple', type: 'growth', kind: 'stock', sector: 'Technology',
        data: { price: 200, change: 1, perf12m: 10, dividendYield: 0, currency: 'USD', exchange: 'NASDAQ', updated: '2026-09-01' } }],
      universe, store, now: new Date('2026-09-01T14:00:00.000Z'),
      universeVersion: 'universe-test',
    })

    expect(created).toMatchObject({
      generationId: expect.stringMatching(/^core-20260901T140000000Z-[a-f0-9]{12}$/),
      universeVersion: 'universe-test',
      records: [
        { ticker: 'AAPL', kind: 'stock', datasets: { data: { price: 200 }, evaluation: null } },
        { ticker: 'BTC-USD', kind: 'crypto', datasets: { data: null, evaluation: null } },
      ],
    })
    expect(store.publishCandidate).toHaveBeenCalledWith(created!.generationId, 'previous')
    expect(result.status).toBe('published')
  })

  it('rejects duplicate or foreign source tickers before persistence', async () => {
    const store = { createCandidate: jest.fn() } as unknown as CoreGenerationStore
    const universe = [{ ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, bucket: 'growth' as const, sector: 'Technology' }]
    const item = { ticker: 'AAPL', name: 'Apple', type: 'growth', kind: 'stock' as const, sector: 'Technology', data: null }

    await expect(publishCarteiraSnapshot({ items: [item, item], universe, store, now: new Date(), universeVersion: 'u' }))
      .rejects.toThrow('duplicate')
    await expect(publishCarteiraSnapshot({ items: [{ ...item, ticker: 'FOREIGN' }], universe, store, now: new Date(), universeVersion: 'u' }))
      .rejects.toThrow('outside')
    expect(store.createCandidate).not.toHaveBeenCalled()
  })
})
