import { projectCoreTop10 } from '../../../src/services/clareza/core/coreTop10Projection'

describe('core Top 10 projection', () => {
  const source = {
    generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a', createdAt: new Date('2026-09-01T12:00:00.000Z'),
    assets: [
      { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, data: { price: 200, currency: 'USD', isActivelyTrading: true } },
      { ticker: 'ASML.AS', name: 'ASML', kind: 'stock' as const, data: { price: 900, currency: 'EUR', isActivelyTrading: true } },
      { ticker: 'SPCX', name: 'SpaceX', kind: 'stock' as const, data: { price: 160, currency: 'USD', isActivelyTrading: false } },
    ],
  }

  it('validates editorial aliases against the universe and emits flat common data with history', () => {
    const payload = projectCoreTop10(source, [
      { key: 'ASML', canonicalTicker: 'ASML.AS', currency: '€' },
      { key: 'AAPL', canonicalTicker: 'AAPL', currency: '$' },
    ], [
      { ticker: 'ASML.AS', points: [{ date: '2026-08-31', close: 890 }, { date: 'bad', close: 1 }] },
      { ticker: 'AAPL', points: [{ date: '2026-08-31', close: 198 }] },
    ], 'Q3 2026')

    expect(payload).toMatchObject({
      generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
      revision: 'Q3 2026', coverage: { selected: 2, available: 2, missing: [] },
    })
    expect(Object.keys(payload.stocks)).toEqual(['ASML', 'AAPL'])
    expect(payload.stocks.ASML).toEqual(expect.objectContaining({
      currency: '€', price: 900,
      historical: [{ date: '2026-08-31', close: 890 }],
    }))
  })

  it('keeps a known editorial asset explicit without inventing a manual quote fallback', () => {
    const payload = projectCoreTop10(source, [
      { key: 'SPCX', canonicalTicker: 'SPCX', currency: '$' },
      { key: 'UNKNOWN', canonicalTicker: 'MISSING', currency: '$' },
    ], [], 'Q3 2026')

    expect(payload.stocks.SPCX).toEqual(expect.objectContaining({ price: 160, historical: [], isPrivate: false }))
    expect(payload.rejected).toEqual([
      { key: 'UNKNOWN', canonicalTicker: 'MISSING', reason: 'unknown-symbol' },
    ])
  })

  it('rejects duplicate editorial keys and duplicate canonical selections', () => {
    expect(() => projectCoreTop10(source, [
      { key: 'APPLE', canonicalTicker: 'AAPL', currency: '$' },
      { key: 'AAPL', canonicalTicker: 'AAPL', currency: '$' },
    ], [], 'Q3 2026')).toThrow('duplicate canonical')
  })
})
