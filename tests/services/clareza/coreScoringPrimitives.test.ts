import {
  aggregateValuation,
  interpolateScore,
  medianFinite,
} from '../../../src/services/clareza/core/coreValuation'
describe('core valuation primitives', () => {
  it('interpolates continuously and clamps to the reference anchors', () => {
    const scale = [[-0.5, 95], [-0.3, 85], [0.15, 32]] as const
    expect(interpolateScore(-1, scale)).toBe(95)
    expect(interpolateScore(-0.4, scale)).toBe(90)
    expect(interpolateScore(1, scale)).toBe(32)
    expect(interpolateScore(Number.NaN, scale)).toBeNull()
  })

  it('calculates a median from finite normalized values only', () => {
    expect(medianFinite([4, null, 2, Number.POSITIVE_INFINITY, 8, 6])).toBe(5)
    expect(medianFinite([null, Number.NaN])).toBeNull()
  })

  it('renormalizes present pillars and shrinks low coverage toward neutral', () => {
    expect(aggregateValuation([
      { key: 'history', score: 80 },
      { key: 'sector', score: 60 },
    ])).toMatchObject({ score: 72, rawUnshrunk: 72, coverage: 0.6, lowConfidence: false })

    expect(aggregateValuation([{ key: 'intrinsic', score: 100 }])).toMatchObject({
      score: 67, rawUnshrunk: 100, coverage: 0.2, lowConfidence: true,
    })
    expect(aggregateValuation([])).toEqual({
      score: null, rawUnshrunk: null, pillars: [], coverage: 0, lowConfidence: true,
    })
  })
})
