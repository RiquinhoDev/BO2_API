import { searchCoreCarteira } from '../../../src/services/clareza/core/coreCarteiraSearch'

describe('core Carteira search', () => {
  const assets = [
    { ticker: 'CSP1.L', name: 'iShares Core S&P 500', kind: 'fund' as const, data: { currency: 'USD' } },
    { ticker: 'SXR8.DE', name: 'Independent Xetra Fund', kind: 'fund' as const, data: { currency: 'EUR' } },
    { ticker: 'AAPL', name: 'Apple Inc.', kind: 'stock' as const, data: null },
  ]

  it('gives a canonical ticker precedence over an alias with the same symbol', () => {
    const response = searchCoreCarteira('sxr8.de', assets, [
      { aliasTicker: 'SXR8.DE', canonicalTicker: 'CSP1.L' },
    ])

    expect(response.results).toEqual([expect.objectContaining({
      ticker: 'SXR8.DE', name: 'Independent Xetra Fund', via_alias: null,
    })])
  })

  it('returns canonical identity and the matched alias without duplicating the asset', () => {
    const response = searchCoreCarteira('cspx', assets, [
      { aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L' },
      { aliasTicker: 'CSPX.L', canonicalTicker: 'CSP1.L' },
    ])

    expect(response).toMatchObject({ query: 'CSPX', count: 1 })
    expect(response.results).toEqual([expect.objectContaining({
      ticker: 'CSP1.L', via_alias: 'CSPX.AS', currency: 'USD',
    })])
  })

  it('fails closed for an ambiguous alias instead of choosing an identity', () => {
    const response = searchCoreCarteira('vusa', assets, [
      { aliasTicker: 'VUSA', canonicalTicker: 'CSP1.L' },
      { aliasTicker: 'VUSA', canonicalTicker: 'SXR8.DE' },
    ])

    expect(response.results).toEqual([])
  })

  it('keeps a known asset searchable while its market data is absent', () => {
    const response = searchCoreCarteira('apple', assets, [])

    expect(response.results).toEqual([expect.objectContaining({
      ticker: 'AAPL', currency: null, via_alias: null,
    })])
  })
})
