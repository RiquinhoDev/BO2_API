import { createCoreAliasWorkflow } from '../../../src/services/clareza/core/coreAliasWorkflow'

describe('core alias workflow', () => {
  it('discovers only same-ISIN variants and publishes one CAS revision', async () => {
    const store = {
      read: jest.fn().mockResolvedValue({
        revision: 2, state: { aliases: [], processed: [], failures: [], conflicts: [] },
      }),
      replace: jest.fn().mockResolvedValue(3),
    }
    const fmp = { get: jest.fn().mockResolvedValue([
      { symbol: 'CSP1.L', isin: 'IE00B5BMR087' },
      { symbol: 'CSPX.AS', isin: 'IE00B5BMR087' },
      { symbol: 'FAKE.DE', isin: 'DIFFERENT' },
    ]) }
    const run = createCoreAliasWorkflow({
      store, fmp, universe: [
        { ticker: 'CSP1.L', kind: 'fund' }, { ticker: 'AAPL', kind: 'stock' },
      ], now: () => '2026-09-02T10:00:00.000Z',
    })

    await expect(run({ limit: 40 })).resolves.toMatchObject({
      status: 'published', revision: 3, processed: 1, aliasesAdded: 1, remaining: 0,
    })
    expect(fmp.get).toHaveBeenCalledWith('/search-exchange-variants', { symbol: 'CSP1.L' })
    expect(store.replace).toHaveBeenCalledWith(expect.objectContaining({
      aliases: [expect.objectContaining({ aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L' })],
    }), 2)
  })

  it('persists a retryable failure without marking the ETF processed', async () => {
    const store = {
      read: jest.fn().mockResolvedValue({
        revision: 0, state: { aliases: [], processed: [], failures: [], conflicts: [] },
      }),
      replace: jest.fn().mockResolvedValue(1),
    }
    const run = createCoreAliasWorkflow({
      store, fmp: { get: jest.fn().mockRejectedValue(new Error('FMP unavailable')) },
      universe: [{ ticker: 'CSP1.L', kind: 'fund' }],
      now: () => '2026-09-02T10:00:00.000Z',
    })

    await expect(run({ limit: 1 })).resolves.toMatchObject({ status: 'published', failures: 1 })
    expect(store.replace).toHaveBeenCalledWith(expect.objectContaining({
      processed: [], failures: [expect.objectContaining({ ticker: 'CSP1.L' })],
    }), 0)
  })
})
