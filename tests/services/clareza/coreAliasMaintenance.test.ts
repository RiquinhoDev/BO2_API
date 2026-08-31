import {
  applyAliasDiscovery,
  reconcileAliasState,
  selectPendingAliasAssets,
  type CoreAliasState,
} from '../../../src/services/clareza/core/coreAliasMaintenance'

describe('core alias maintenance', () => {
  const universe = [
    { ticker: 'CSP1.L', kind: 'fund' as const, instrumentId: 'IE00B5BMR087' },
    { ticker: 'AAPL', kind: 'stock' as const, instrumentId: 'US0378331005' },
    { ticker: 'SXR8.DE', kind: 'fund' as const, instrumentId: 'OTHER' },
    { ticker: 'BTC-USD', kind: 'crypto' as const, instrumentId: null },
  ]
  const empty: CoreAliasState = { aliases: [], processed: [] }

  it('selects only eligible unprocessed assets and retries failed discoveries', () => {
    expect(selectPendingAliasAssets(universe, empty, 10).map(item => item.ticker))
      .toEqual(['CSP1.L', 'AAPL', 'SXR8.DE'])

    const failed = applyAliasDiscovery(empty, universe, {
      canonicalTicker: 'CSP1.L', status: 'retryable-failure', variants: [],
      observedAt: '2026-09-01T13:00:00.000Z',
    })
    expect(failed.state.processed).toEqual([])
    expect(selectPendingAliasAssets(universe, failed.state, 1)[0]?.ticker).toBe('CSP1.L')
  })

  it('records only variants proven to be the same instrument and never hides a canonical ticker', () => {
    const result = applyAliasDiscovery(empty, universe, {
      canonicalTicker: 'CSP1.L', status: 'success', observedAt: '2026-09-01T13:00:00.000Z',
      variants: [
        { ticker: 'CSPX.AS', instrumentId: 'IE00B5BMR087' },
        { ticker: 'SXR8.DE', instrumentId: 'IE00B5BMR087' },
        { ticker: 'FAKE.DE', instrumentId: 'DIFFERENT' },
      ],
    })

    expect(result.state.aliases).toEqual([expect.objectContaining({
      aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L',
      provenance: 'fmp-exchange-variants', instrumentId: 'IE00B5BMR087',
    })])
    expect(result.state.processed).toEqual([{ ticker: 'CSP1.L', processedAt: '2026-09-01T13:00:00.000Z' }])
    expect(result.rejected.map(item => item.reason)).toEqual(['canonical-ticker-precedence', 'instrument-mismatch'])
  })

  it('detects conflicts without overwriting the established identity', () => {
    const state: CoreAliasState = {
      processed: [],
      aliases: [{ aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L', instrumentId: 'IE00B5BMR087', provenance: 'fmp-exchange-variants', observedAt: '2026-08-31T00:00:00.000Z' }],
    }
    const result = applyAliasDiscovery(state, universe, {
      canonicalTicker: 'AAPL', status: 'success', observedAt: '2026-09-01T13:00:00.000Z',
      variants: [{ ticker: 'CSPX.AS', instrumentId: 'US0378331005' }],
    })

    expect(result.state.aliases).toEqual(state.aliases)
    expect(result.conflicts).toEqual([{ aliasTicker: 'CSPX.AS', existingCanonicalTicker: 'CSP1.L', proposedCanonicalTicker: 'AAPL' }])
  })

  it('invalidates aliases and processed markers whose canonical asset left the universe', () => {
    const state: CoreAliasState = {
      aliases: [{ aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L', instrumentId: 'IE00B5BMR087', provenance: 'fmp-exchange-variants', observedAt: '2026-08-31T00:00:00.000Z' }],
      processed: [{ ticker: 'CSP1.L', processedAt: '2026-08-31T00:00:00.000Z' }],
    }

    expect(reconcileAliasState(state, universe.filter(item => item.ticker !== 'CSP1.L')))
      .toEqual({ aliases: [], processed: [] })
  })
})
