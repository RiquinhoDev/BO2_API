import { createCoreCarteiraSearchRuntime } from '../../../src/services/clareza/core/coreCarteiraSearchRuntime'

describe('core Carteira search runtime', () => {
  it('combines the canonical universe, published data and persisted aliases without provider I/O', async () => {
    const generationStore = { readPublished: jest.fn().mockResolvedValue({
      records: [{ ticker: 'CSP1.L', kind: 'fund', datasets: { data: { currency: 'USD' } } }],
    }) }
    const aliasStore = { read: jest.fn().mockResolvedValue({
      revision: 3,
      state: { aliases: [{ aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L' }], processed: [] },
    }) }
    const search = createCoreCarteiraSearchRuntime({
      generationStore,
      aliasStore,
      universe: [{ ticker: 'CSP1.L', name: 'iShares Core S&P 500', kind: 'fund' }],
    })

    await expect(search('cspx.as')).resolves.toEqual({
      query: 'CSPX.AS', count: 1,
      results: [{
        ticker: 'CSP1.L', name: 'iShares Core S&P 500', type: 'fund', kind: 'fund',
        currency: 'USD', via_alias: 'CSPX.AS',
      }],
    })
    expect(generationStore.readPublished).toHaveBeenCalledTimes(1)
    expect(aliasStore.read).toHaveBeenCalledTimes(1)
  })
})
