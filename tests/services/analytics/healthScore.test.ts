import { calculateHealthScore } from '../../../src/services/analytics/healthScore'

describe('calculateHealthScore', () => {
  it('returns the canonical weighted health score and breakdown', () => {
    expect(calculateHealthScore({
      avgEngagement: 80,
      activeCount: 80,
      totalCount: 100,
      newLast7Days: 5,
      avgProgress: 60,
    })).toEqual({
      healthScore: 72,
      healthLevel: 'RAZOÁVEL',
      healthBreakdown: {
        engagement: 80,
        retention: 80,
        growth: 50,
        progress: 60,
      },
    })
  })

  it.each([
    [85, 'EXCELENTE'],
    [75, 'BOM'],
    [60, 'RAZOÁVEL'],
  ] as const)('assigns %i to the %s health level', (score, healthLevel) => {
    expect(calculateHealthScore({
      avgEngagement: score,
      activeCount: score * 2,
      totalCount: 200,
      newLast7Days: (score * 2) / 10,
      avgProgress: score,
    })).toMatchObject({
      healthScore: score,
      healthLevel,
    })
  })

  it('uses zero retention and growth for a zero total without clamping inputs', () => {
    const result = calculateHealthScore({
      avgEngagement: 120,
      activeCount: 3,
      totalCount: 0,
      newLast7Days: 2,
      avgProgress: -15,
    })

    expect(result).toEqual({
      healthScore: 47,
      healthLevel: 'CRÍTICO',
      healthBreakdown: {
        engagement: 120,
        retention: 0,
        growth: 0,
        progress: -15,
      },
    })
    expect(Number.isNaN(result.healthScore)).toBe(false)
  })
})
