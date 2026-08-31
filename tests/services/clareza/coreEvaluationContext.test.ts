import {
  buildSectorContext,
  percentileRank,
  radarRank,
  resolveSectorMedian,
} from '../../../src/services/clareza/core/coreEvaluationContext'

const peers = [
  { ticker: 'A', sector: 'Tech', bucket: 'growth', metrics: { pe: 10 } },
  { ticker: 'B', sector: 'Tech', bucket: 'growth', metrics: { pe: 20 } },
  { ticker: 'C', sector: 'Tech', bucket: 'growth', metrics: { pe: 30 } },
  { ticker: 'D', sector: 'Tech', bucket: 'growth', metrics: { pe: 40 } },
  { ticker: 'E', sector: 'Tech', bucket: 'value', metrics: { pe: 50 } },
  { ticker: 'F', sector: 'Tech', bucket: 'value', metrics: { pe: 60 } },
] as const

describe('core evaluation context', () => {
  it('builds deterministic group medians and sector fallback without mixing small buckets', () => {
    const context = buildSectorContext(peers)
    const permuted = buildSectorContext([...peers].reverse())

    expect(context).toEqual(permuted)
    expect(resolveSectorMedian(context, 'Tech', 'growth', 'pe')).toEqual({
      value: 25, source: 'sector-bucket', sampleSize: 4,
    })
    expect(resolveSectorMedian(context, 'Tech', 'value', 'pe')).toEqual({
      value: 35, source: 'sector', sampleSize: 6,
    })
    expect(resolveSectorMedian(context, 'Other', 'value', 'pe')).toBeNull()
  })

  it('rejects invalid multiples and requires four peers for either median', () => {
    const context = buildSectorContext([
      { ticker: 'A', sector: 'Tech', bucket: 'growth', metrics: { pe: 0 } },
      { ticker: 'B', sector: 'Tech', bucket: 'growth', metrics: { pe: -1 } },
      { ticker: 'C', sector: 'Tech', bucket: 'growth', metrics: { pe: 301 } },
      { ticker: 'D', sector: 'Tech', bucket: 'growth', metrics: { pe: Number.NaN } },
    ])
    expect(context.groups).toEqual({})
  })

  it('uses midpoint ties and rejects percentiles from samples below five', () => {
    expect(percentileRank(20, [10, 20, 20, 30])).toBeNull()
    expect(percentileRank(20, [10, 20, 20, 30, 40])).toBe(40)
    expect(percentileRank(40, [10, 20, 30, 40, 50])).toBe(70)
  })

  it('calculates radar rank only for eligible verdicts with both scores', () => {
    expect(radarRank('barata-excelente', 80, 70)).toBe(76.5)
    expect(radarRank('barata-boa', 60, 60)).toBe(60)
    expect(radarRank('cara-excelente', 80, 80)).toBeNull()
    expect(radarRank('barata-boa', null, 80)).toBeNull()
  })
})
