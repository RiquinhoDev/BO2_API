import { buildSectorContext } from '../../../src/services/clareza/core/coreEvaluationContext'
import { evaluateCoreAsset } from '../../../src/services/clareza/core/coreAssetEvaluation'

describe('core asset evaluation', () => {
  it('calculates the four valuation pillars and quality once on the server', () => {
    const data = {
      price: 200, pe: 20, evEbitda: 10, fcfYield: 8, epsCagr: 20,
      roic: 18, netMargin: 20, grossMarginTTM: 60,
      debtEbitda: 1.5, interestCoverage: 10,
      marginStability: 80, fcfConversion: 100,
      histMedians: { evEbitda: 12 },
    }
    const context = buildSectorContext([
      { ticker: 'AAPL', sector: 'Technology', bucket: 'growth', metrics: { evEbitda: 10 } },
      { ticker: 'MSFT', sector: 'Technology', bucket: 'growth', metrics: { evEbitda: 14 } },
      { ticker: 'GOOGL', sector: 'Technology', bucket: 'growth', metrics: { evEbitda: 14 } },
      { ticker: 'META', sector: 'Technology', bucket: 'growth', metrics: { evEbitda: 14 } },
      { ticker: 'AMZN', sector: 'Technology', bucket: 'growth', metrics: { evEbitda: 18 } },
    ])

    const evaluation = evaluateCoreAsset({
      ticker: 'AAPL', bucket: 'growth', sector: 'Technology', data,
    }, context)

    expect(evaluation).toMatchObject({
      ticker: 'AAPL', bucket: 'growth',
      valuation: { score: 77, label: 'BARATO', coverage: 1, lowConfidence: false },
      quality: { score: 77, label: 'EXCELENTE' },
      verdict: { key: 'barata-excelente' },
      radarRank: 77,
    })
    expect(evaluation.valuation.pillars.map(pillar => pillar.key))
      .toEqual(['history', 'sector', 'peg', 'intrinsic'])
    expect(evaluation.quality.parts.map(part => part.key))
      .toEqual(['rent', 'cresc', 'saude', 'cons'])
  })

  it('keeps absent evidence explicit instead of fabricating a neutral score', () => {
    const evaluation = evaluateCoreAsset({
      ticker: 'EMPTY', bucket: 'value', sector: 'Other', data: { price: 10 },
    }, { groups: {} })

    expect(evaluation.valuation).toMatchObject({ score: null, coverage: 0, lowConfidence: true })
    expect(evaluation.quality).toMatchObject({ score: null, parts: [] })
    expect(evaluation.verdict.key).toBe('indefinido')
    expect(evaluation.radarRank).toBeNull()
  })
})
