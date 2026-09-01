import {
  CoreGenerationUnavailableError,
  projectRadarGeneration,
} from '../../../src/services/clareza/core/coreRadarProjection'

describe('core Radar projection', () => {
  it('projects stocks and REITs with the same evaluation and generation identity', () => {
    const evaluation = { valuation: { score: 72 }, quality: { score: 80 } }
    const result = projectRadarGeneration({
      generationId: 'generation-a', universeVersion: 'universe-v1', dataVersion: 'data-v1',
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      assets: [
        { ticker: 'O', name: 'Realty Income', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate',
          data: { price: 60, currency: 'USD' }, evaluation },
        { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology',
          data: { price: 200, currency: 'USD' }, evaluation },
        { ticker: 'VWCE.DE', name: 'ETF', kind: 'fund', type: 'etf', bucket: 'fund', sector: 'Fund',
          data: { price: 120 }, evaluation: null },
      ],
    })

    expect(result).toMatchObject({
      generationId: 'generation-a', universeVersion: 'universe-v1', dataVersion: 'data-v1',
      updated: '2026-09-01T10:00:00.000Z', count: 2,
    })
    expect(result.stocks.map(stock => stock.ticker)).toEqual(['AAPL', 'O'])
    expect(result.stocks[0]).toMatchObject({
      ticker: 'AAPL', type: 'growth', kind: 'stock', bucket: 'growth', evaluation,
    })
    expect(result.stocks[1]).toMatchObject({ ticker: 'O', type: 'reit', kind: 'stock' })
  })

  it('keeps a known eligible asset with null data instead of deleting it', () => {
    const result = projectRadarGeneration({
      generationId: 'generation-a', universeVersion: 'universe-v1', dataVersion: 'data-v1',
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      assets: [{ ticker: 'MISSING', name: 'Known', kind: 'stock', type: 'value', bucket: 'value',
        sector: 'Other', data: null, evaluation: null }],
    })
    expect(result.stocks[0]).toMatchObject({ ticker: 'MISSING', data: null, evaluation: null })
  })

  it('fails explicitly when no published core generation is available', () => {
    expect(() => projectRadarGeneration(null)).toThrow(CoreGenerationUnavailableError)
  })
})
