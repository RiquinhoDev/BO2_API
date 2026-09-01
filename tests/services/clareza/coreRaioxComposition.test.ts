import {
  CoreRaioxAssetUnavailableError,
  composeCoreRaioxPayload,
} from '../../../src/services/clareza/core/coreRaioxComposition'

describe('core Raio-X composition', () => {
  it('combines core and companion data while converting percentage fields to legacy fractions', () => {
    const evaluation = { valuation: { score: 72 }, quality: { score: 80 } }
    const payload = composeCoreRaioxPayload({
      generationId: 'generation-a', ticker: 'ASML.AS', name: 'ASML', sector: 'Technology',
      data: {
        price: 900, currency: 'EUR', exchange: 'AMS', change: 1.5, marketCap: 350,
        pe: 30, pb: 10, ps: 12, peg: 2, grossMarginTTM: 51,
        netMargin: 28, roe: 42, dividendYield: 0.9, payoutRatio: 25,
        debtEquity: 0.4, evEbitda: 25, roic: 33, fcfYield: 3, interestCoverage: 20,
        dcf: 950,
      },
      evaluation,
    }, {
      profileExtra: { ceo: 'CEO', country: 'NL', industry: 'Semiconductors' },
      forwardPe: 28,
      annualIncome: [{ date: '2025-12-31' }], annualCashFlow: [],
      quarterlyIncome: [], quarterlyCashFlow: [], annualRatios: [],
      gradesConsensus: {}, priceTargetConsensus: {}, earnings: [], dividends: [],
      peerRatios: {}, momentum: null, segmentation: [], updated: '2026-09-01T11:00:00.000Z',
    }, [{ sector: 'Technology', pe: 25 }])

    expect(payload).toMatchObject({
      generationId: 'generation-a', ticker: 'ASML.AS', evaluation,
      p: { companyName: 'ASML', price: 900, country: 'NL' },
      r: { grossProfitMarginTTM: 0.51, netProfitMarginTTM: 0.28,
        returnOnEquityTTM: 0.42, dividendYieldTTM: 0.009 },
      km: { returnOnInvestedCapitalTTM: 0.33, freeCashFlowYieldTTM: 0.03 },
      inc: [{ date: '2025-12-31' }], companion_updated: '2026-09-01T11:00:00.000Z',
      sectorPe: [{ sector: 'Technology', pe: 25 }],
    })
    expect(payload.complementCoverage.profileExtra).toBe('available')
  })

  it('keeps missing complement datasets explicit while preserving the core evaluation', () => {
    const payload = composeCoreRaioxPayload({
      generationId: 'generation-a', ticker: 'AAPL', name: 'Apple', sector: 'Technology',
      data: { price: 200 }, evaluation: { verdict: { key: 'barata-boa' } },
    }, null)

    expect(payload.inc).toEqual([])
    expect(payload.evaluation).toEqual({ verdict: { key: 'barata-boa' } })
    expect(new Set(Object.values(payload.complementCoverage))).toEqual(new Set(['missing']))
  })

  it('fails before composition for an unknown core asset', () => {
    expect(() => composeCoreRaioxPayload(null, null)).toThrow(CoreRaioxAssetUnavailableError)
  })
})
