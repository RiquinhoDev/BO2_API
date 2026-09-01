import { projectCarteiraGeneration } from '../../../src/services/clareza/core/coreCarteiraProjection'
import { projectCoreComparison } from '../../../src/services/clareza/core/coreComparadorProjection'
import { projectRadarGeneration } from '../../../src/services/clareza/core/coreRadarProjection'

describe('core cross-tool equivalence', () => {
  const evaluation = {
    valuation: { score: 72, label: 'BARATO' },
    quality: { score: 80, label: 'BOA' },
    verdict: { key: 'barata-boa' },
  }
  const source = {
    generationId: 'generation-shared',
    universeVersion: 'universe-v1',
    dataVersion: 'data-v1',
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    assets: [
      {
        ticker: 'aapl', name: 'Apple', kind: 'stock' as const, type: 'growth' as const,
        bucket: 'growth', sector: 'Technology', data: { price: 200, currency: 'USD' }, evaluation,
      },
      {
        ticker: 'o', name: 'Realty Income', kind: 'stock' as const, type: 'reit' as const,
        bucket: 'reit', sector: 'Real Estate', data: { price: 60, currency: 'USD' }, evaluation,
      },
    ],
  }

  it('keeps price and evaluation identical for one stock across Radar, Carteira and Comparador', () => {
    const radar = projectRadarGeneration(source)
    const carteira = projectCarteiraGeneration(source)
    const comparador = projectCoreComparison('AAPL', source.assets, [])
    const radarStock = radar.stocks.find(item => item.ticker === 'AAPL')
    const carteiraStock = carteira.items.find(item => item.ticker === 'AAPL')
    const comparadorStock = comparador.companies[0]

    expect(radar.generationId).toBe(carteira.generationId)
    expect(radar.dataVersion).toBe(carteira.dataVersion)
    expect(radarStock?.data?.price).toBe(carteiraStock?.data?.price)
    expect(comparadorStock.price).toBe(radarStock?.data?.price)
    expect(radarStock?.evaluation).toEqual(carteiraStock?.evaluation)
    expect(comparadorStock.coreEvaluation).toEqual(radarStock?.evaluation)
  })

  it('keeps a REIT in Radar and Carteira but reports its Comparador ineligibility', () => {
    const radar = projectRadarGeneration(source)
    const carteira = projectCarteiraGeneration(source)
    const comparador = projectCoreComparison('O', source.assets, [])

    expect(radar.stocks.find(item => item.ticker === 'O')?.evaluation).toEqual(evaluation)
    expect(carteira.items.find(item => item.ticker === 'O')?.evaluation).toEqual(evaluation)
    expect(comparador).toEqual({
      count: 0,
      companies: [],
      rejected: [{ ticker: 'O', reason: 'ineligible-kind' }],
    })
  })
})
