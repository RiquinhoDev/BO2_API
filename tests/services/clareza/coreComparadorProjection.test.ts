import {
  CoreComparadorRequestError,
  projectCoreComparison,
} from '../../../src/services/clareza/core/coreComparadorProjection'

describe('core Comparador projection', () => {
  const assets = [
    { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, data: { price: 200, currency: 'USD', pe: 30 }, evaluation: { verdict: 'justa' } },
    { ticker: 'ASML.AS', name: 'ASML', kind: 'stock' as const, data: { price: 900, currency: 'EUR', pe: null }, evaluation: null },
    { ticker: 'O', name: 'Realty Income', kind: 'reit' as const, data: { price: 60, currency: 'USD' }, evaluation: { verdict: 'boa' } },
  ]
  const consensus = [
    { ticker: 'AAPL', gradesConsensus: { consensus: 'buy' }, priceTargetConsensus: { targetConsensus: 230 }, updatedAt: '2026-09-01T12:00:00.000Z' },
  ]

  it('deduplicates symbols in request order and keeps core evaluation separate', () => {
    const result = projectCoreComparison('asml.as,AAPL,ASML.AS', assets, consensus)

    expect(result.companies.map(company => company.ticker)).toEqual(['ASML.AS', 'AAPL'])
    expect(result.companies[0]).toMatchObject({ currency: 'EUR', pe: null, analystConsensus: null })
    expect(result.companies[1]).toMatchObject({
      price: 200, analystConsensus: { consensus: 'buy' },
      priceTargetConsensus: { targetConsensus: 230 }, coreEvaluation: { verdict: 'justa' },
    })
  })

  it('reports unknown and ineligible REIT symbols without collecting data', () => {
    const result = projectCoreComparison('O,MISSING,AAPL', assets, consensus)

    expect(result.companies.map(company => company.ticker)).toEqual(['AAPL'])
    expect(result.rejected).toEqual([
      { ticker: 'O', reason: 'ineligible-kind' },
      { ticker: 'MISSING', reason: 'unknown-symbol' },
    ])
  })

  it('fails closed above four unique symbols', () => {
    expect(() => projectCoreComparison('A,B,C,D,E', assets, consensus))
      .toThrow(CoreComparadorRequestError)
  })
})
