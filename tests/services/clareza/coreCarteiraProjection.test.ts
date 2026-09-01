import {
  projectCarteiraGeneration,
} from '../../../src/services/clareza/core/coreCarteiraProjection'
import { CoreGenerationUnavailableError } from '../../../src/services/clareza/core/coreRadarProjection'

describe('core Carteira projection', () => {
  const source = {
    generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    assets: [
      { ticker: 'btc-usd', name: 'Bitcoin', kind: 'crypto' as const, type: 'cripto' as const, bucket: 'crypto', sector: '', data: { price: 60000 }, evaluation: { verdict: 'ignore' } },
      { ticker: 'AAPL', name: 'Apple', kind: 'stock' as const, type: 'growth' as const, bucket: 'usa', sector: 'Technology', data: { price: 200 }, evaluation: { verdict: 'boa' } },
      { ticker: 'VWCE.DE', name: 'Vanguard', kind: 'fund' as const, type: 'etf' as const, bucket: 'etf', sector: '', data: { price: 130 }, evaluation: { verdict: 'ignore' } },
      { ticker: 'O', name: 'Realty Income', kind: 'stock' as const, type: 'reit' as const, bucket: 'reit', sector: 'Real Estate', data: { price: 60 }, evaluation: { verdict: 'justa' } },
    ],
  }

  it('projects every asset kind while keeping evaluations only where scoring applies', () => {
    const payload = projectCarteiraGeneration(source)

    expect(payload).toMatchObject({
      generationId: 'generation-a', universeVersion: 'universe-a', dataVersion: 'data-a',
      updated: '2026-09-01T12:00:00.000Z', count: 4,
    })
    expect(payload.items.map(item => item.ticker)).toEqual(['AAPL', 'BTC-USD', 'O', 'VWCE.DE'])
    expect(payload.items.find(item => item.ticker === 'AAPL')).toMatchObject({
      kind: 'stock', type: 'growth', data: { price: 200 }, evaluation: { verdict: 'boa' },
    })
    expect(payload.items.find(item => item.ticker === 'O')).toMatchObject({ kind: 'stock', type: 'reit' })
    expect(payload.items.find(item => item.ticker === 'BTC-USD')?.evaluation).toBeNull()
    expect(payload.items.find(item => item.ticker === 'VWCE.DE')?.evaluation).toBeNull()
  })

  it('preserves a known asset when its market data is unavailable', () => {
    const payload = projectCarteiraGeneration({
      ...source,
      assets: [{ ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'usa', sector: 'Technology', data: null, evaluation: null }],
    })

    expect(payload.items).toEqual([expect.objectContaining({ ticker: 'AAPL', data: null, evaluation: null })])
  })

  it('rejects unavailable generations and duplicate normalized tickers', () => {
    expect(() => projectCarteiraGeneration(null)).toThrow(CoreGenerationUnavailableError)
    expect(() => projectCarteiraGeneration({
      ...source,
      assets: [source.assets[1], { ...source.assets[1], ticker: ' aapl ' }],
    })).toThrow('duplicate tickers')
  })
})
