import analyticsCalculator from '../../src/services/analytics/analyticsCalculator.service'
import { generateCumulativeTimeSeries, generateNewStudentsTimeSeries } from '../../src/services/analytics/calculator/timeSeries'

describe('analytics calculator topology', () => {
  it('keeps time-series queries outside KPI calculation while preserving the singleton API', () => {
    expect(typeof generateCumulativeTimeSeries).toBe('function')
    expect(typeof generateNewStudentsTimeSeries).toBe('function')
    expect(typeof analyticsCalculator.calculateMetrics).toBe('function')
    expect(typeof analyticsCalculator.generateCumulativeTimeSeries).toBe('function')
  })
})
