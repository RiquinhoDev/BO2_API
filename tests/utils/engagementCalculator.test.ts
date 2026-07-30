import { calculateCombinedEngagement } from '../../src/utils/engagementCalculator'

describe('calculateCombinedEngagement', () => {
  it('preserves the 40/40/20 formula and high-score output', () => {
    const result = calculateCombinedEngagement({
      engagement: 'ALTO',
      accessCount: 31,
      progress: { completedPercentage: 100 },
    })

    expect(result).toMatchObject({
      score: 89,
      level: 'MUITO_ALTO',
      breakdown: {
        accessScore: 86,
        progressScore: 100,
        engagementScore: 75,
        weights: { access: 0.4, progress: 0.4, engagement: 0.2 },
      },
    })
  })

  it('keeps absent engagement neutral and the exact low-level boundary', () => {
    expect(calculateCombinedEngagement({
      accessCount: 0,
      progress: { completedPercentage: 0 },
    })).toMatchObject({
      score: 4,
      level: 'MUITO_BAIXO',
      breakdown: { engagementScore: 20 },
    })

    expect(calculateCombinedEngagement({
      engagement: 'ALTO',
      accessCount: 0,
      progress: { completedPercentage: 0 },
    })).toMatchObject({ score: 15, level: 'BAIXO' })
  })

  it('keeps progress capped at one hundred', () => {
    expect(calculateCombinedEngagement({
      engagement: 'NONE',
      accessCount: 0,
      progress: { completedPercentage: 150 },
    }).breakdown.progressScore).toBe(100)
  })

  it('does not write learner or metric data to the console', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      calculateCombinedEngagement({
        engagement: 'MEDIO',
        accessCount: 7,
        progress: { completedPercentage: 42 },
        email: 'private@example.test',
      })
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
