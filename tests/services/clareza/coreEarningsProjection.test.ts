import { projectCoreEarnings } from '../../../src/services/clareza/core/coreEarningsProjection'

describe('core Earnings projection', () => {
  const assets = [
    { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, data: { currency: 'USD' } },
    { ticker: 'O', name: 'Realty Income', kind: 'stock' as const, type: 'reit' as const, data: {} },
    { ticker: 'VWCE.DE', name: 'Vanguard', kind: 'fund' as const, type: 'etf' as const, data: { currency: 'EUR' } },
  ]

  it('selects the nearest future and latest reported event from unordered rows', () => {
    const payload = projectCoreEarnings(assets, [
      { ticker: 'AAPL', events: [
        { date: '2026-11-05', epsEstimated: 2.1 },
        { date: '2026-07-20', epsEstimated: 1.5, epsActual: 1.6 },
        { date: '2026-09-15', epsEstimated: 1.8 },
        { date: '2026-04-20', epsEstimated: 1.4, epsActual: 1.3 },
      ] },
      { ticker: 'O', events: null },
    ], '2026-09-01', '2026-12-30')

    expect(payload).toMatchObject({
      window: { from: '2026-09-01', to: '2026-12-30' }, count: 1,
      coverage: { eligible: 2, available: 1, missing: ['O'] },
    })
    expect(payload.earnings).toEqual([{
      t: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', d: '2026-09-15', e: 1.8, c: 'USD',
      lr: { d: '2026-07-20', r: 1.6, e: 1.5, b: true },
    }])
  })

  it('supports REITs and represents missing currency without inventing USD', () => {
    const payload = projectCoreEarnings(assets, [
      { ticker: 'O', events: [{ date: '2026-09-10', epsEstimated: null }] },
    ], '2026-09-01', '2026-10-01')

    expect(payload.earnings).toEqual([expect.objectContaining({ t: 'O', kind: 'stock', type: 'reit', c: null })])
  })

  it('ignores malformed and out-of-window future dates', () => {
    const payload = projectCoreEarnings(assets, [
      { ticker: 'AAPL', events: [{ date: '2026-02-30', epsEstimated: 1 }, { date: '2027-01-01', epsEstimated: 2 }] },
    ], '2026-09-01', '2026-12-30')

    expect(payload.earnings).toEqual([])
  })
})
