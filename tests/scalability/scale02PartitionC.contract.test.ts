const calculateMetrics = jest.fn()
const findOneAndUpdate: jest.Mock = jest.fn().mockResolvedValue(undefined)
const findOne: jest.Mock = jest.fn(() => ({
  sort: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../src/models/AnalyticsCache', () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => findOne(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
}))

jest.mock('../../src/services/analytics/analyticsCalculator.service', () => ({
  analyticsCalculatorService: {
    calculateMetrics: (...args: unknown[]) => calculateMetrics(...args),
  },
}))

import { analyticsCacheService } from '../../src/services/analytics/analyticsCache.service'
import { runWithConcurrency } from '../../src/services/clareza/raiox/data'

const metricsOptions = (productId: string) => ({
  productId,
  period: 'daily' as const,
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-01T23:59:59.999Z'),
})

describe('SCALE-02 partition C contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }))
  })

  it('coalesces 50 identical cache misses into one process-local calculation', async () => {
    let release!: (value: Record<string, number>) => void
    calculateMetrics.mockReturnValue(new Promise(resolve => { release = resolve }))

    const requests = Array.from({ length: 50 }, () =>
      analyticsCacheService.getOrCalculateMetrics(metricsOptions('same-product')),
    )

    await Promise.resolve()
    expect(calculateMetrics).toHaveBeenCalledTimes(1)

    release({ totalStudents: 50 })
    const results = await Promise.all(requests)
    expect(results).toHaveLength(50)
    expect(results.every(result => result.totalStudents === 50)).toBe(true)
  })

  it('clears rejected process-local flights so the key can be retried', async () => {
    calculateMetrics
      .mockRejectedValueOnce(new Error('calculator unavailable'))
      .mockResolvedValueOnce({ totalStudents: 7 })

    await expect(analyticsCacheService.getOrCalculateMetrics(metricsOptions('retry-product')))
      .rejects.toThrow('calculator unavailable')
    await expect(analyticsCacheService.getOrCalculateMetrics(metricsOptions('retry-product')))
      .resolves.toMatchObject({ totalStudents: 7 })
    expect(calculateMetrics).toHaveBeenCalledTimes(2)
  })

  it('does not make different cache keys wait for each other', async () => {
    let releaseFirst!: (value: Record<string, number>) => void
    calculateMetrics
      .mockReturnValueOnce(new Promise(resolve => { releaseFirst = resolve }))
      .mockResolvedValueOnce({ totalStudents: 2 })

    const first = analyticsCacheService.getOrCalculateMetrics(metricsOptions('product-a'))
    const second = analyticsCacheService.getOrCalculateMetrics(metricsOptions('product-b'))

    await expect(second).resolves.toMatchObject({ totalStudents: 2 })
    expect(calculateMetrics).toHaveBeenCalledTimes(2)
    releaseFirst({ totalStudents: 1 })
    await expect(first).resolves.toMatchObject({ totalStudents: 1 })
  })

  it.each([10, 100, 10_000])(
    'accounts for all %i provider tasks once with peak concurrency at most 10',
    async (size) => {
      let active = 0
      let peak = 0
      const seen = new Set<number>()
      const tasks = Array.from({ length: size }, (_, index) => async () => {
        active += 1
        peak = Math.max(peak, active)
        await Promise.resolve()
        seen.add(index)
        active -= 1
        return index
      })

      const results = await runWithConcurrency(tasks, 100)

      expect(peak).toBeLessThanOrEqual(10)
      expect(seen.size).toBe(size)
      expect(results).toEqual(Array.from({ length: size }, (_, index) => index))
    },
  )
})
