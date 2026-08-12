const calculateMetrics = jest.fn()
const findOneAndUpdate: jest.Mock = jest.fn().mockResolvedValue(undefined)
const aggregate: jest.Mock = jest.fn()
const countDocuments: jest.Mock = jest.fn()
const find: jest.Mock = jest.fn()
const findOne: jest.Mock = jest.fn(() => ({
  sort: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../src/models/AnalyticsCache', () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => findOne(...args),
    aggregate: (...args: unknown[]) => aggregate(...args),
    countDocuments: (...args: unknown[]) => countDocuments(...args),
    find: (...args: unknown[]) => find(...args),
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
import { EngagementStatsCache } from '../../src/services/engagement/controllerSupport'

const metricsOptions = (productId: string) => ({
  productId,
  period: 'daily' as const,
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-01T23:59:59.999Z'),
})

describe('SCALE-02 partition C contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    aggregate.mockReset()
    countDocuments.mockReset().mockResolvedValueOnce(10_000).mockResolvedValueOnce(125)
    find.mockReset()
    findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue(null) }))
  })

  it('evaluates refresh half-life with server execution time and strict equality', async () => {
    const serverNow = new Date('2026-08-12T12:00:00.000Z')
    const fixtures = [
      { calculatedAt: new Date('2026-08-12T10:00:00.000Z'), expiresAt: new Date('2026-08-12T14:00:00.000Z') },
      { calculatedAt: new Date('2026-08-12T09:59:59.998Z'), expiresAt: new Date('2026-08-12T13:59:59.998Z') },
      { calculatedAt: new Date('2026-08-12T10:00:00.002Z'), expiresAt: new Date('2026-08-12T14:00:00.002Z') },
    ]
    aggregate.mockImplementationOnce((pipeline: unknown[]) => {
      const serialized = JSON.stringify(pipeline)
      expect(serialized).toContain('"$$NOW"')
      expect(serialized).toContain('"$gt"')
      expect(serialized).not.toContain(serverNow.toISOString())
      const count = fixtures.filter(({ calculatedAt, expiresAt }) => {
        const halfLife = calculatedAt.getTime() + (expiresAt.getTime() - calculatedAt.getTime()) / 2
        return serverNow.getTime() > halfLife
      }).length
      return Promise.resolve([{ count }])
    }).mockResolvedValueOnce([])

    await expect(analyticsCacheService.getCacheStats()).resolves.toMatchObject({ needsRefresh: 1 })
    const refreshPipeline = aggregate.mock.calls[0][0]
    expect(refreshPipeline[0].$match.$expr).toEqual({
      $gt: ['$$NOW', { $add: ['$calculatedAt', { $divide: [{ $subtract: ['$expiresAt', '$calculatedAt'] }, 2] }] }],
    })
  })

  it('computes complete cache statistics without materializing cache documents', async () => {
    const oldest = new Date('2026-01-01T00:00:00.000Z')
    const newest = new Date('2026-08-01T00:00:00.000Z')
    findOne.mockImplementation(() => ({ sort: jest.fn((order: { calculatedAt: number }) => Promise.resolve({ calculatedAt: order.calculatedAt === 1 ? oldest : newest })) }))
    aggregate.mockResolvedValueOnce([{ count: 750 }]).mockResolvedValueOnce([
      { _id: 'daily', count: 9_000 }, { _id: 'monthly', count: 1_000 },
    ])
    await expect(analyticsCacheService.getCacheStats()).resolves.toEqual({
      total: 10_000, expired: 125, needsRefresh: 750, valid: 9_875,
      byPeriod: { daily: 9_000, monthly: 1_000 }, oldest, newest,
    })
    expect(find).not.toHaveBeenCalled()
    expect(aggregate).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent warmups by calendar window and fills both keys once', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T12:00:00.000Z'))
    calculateMetrics.mockResolvedValue({ totalStudents: 1 })
    const results = await Promise.all(Array.from({ length: 50 }, () => analyticsCacheService.warmUpCache()))
    expect(calculateMetrics).toHaveBeenCalledTimes(2)
    expect(results.every(result => result.map(item => item.period).join(',') === 'monthly,yearly')).toBe(true)
    jest.useRealTimers()
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

  it('coalesces stale-cache background refreshes', async () => {
    findOne.mockImplementation(() => ({ sort: jest.fn().mockResolvedValue({ calculatedAt: new Date(), metrics: { totalStudents: 1 }, needsRefresh: () => true }) }))
    calculateMetrics.mockReturnValue(new Promise(() => undefined))
    await Promise.all(Array.from({ length: 50 }, () => analyticsCacheService.getOrCalculateMetrics(metricsOptions('stale-product'))))
    expect(calculateMetrics).toHaveBeenCalledTimes(1)
  })

  it('evicts a hung cache flight after 30 seconds', async () => {
    jest.useFakeTimers()
    calculateMetrics.mockReturnValue(new Promise(() => undefined))
    void analyticsCacheService.getOrCalculateMetrics(metricsOptions('hung-product'))
    await jest.advanceTimersByTimeAsync(30_000)
    void analyticsCacheService.getOrCalculateMetrics(metricsOptions('hung-product'))
    await Promise.resolve()
    expect(calculateMetrics).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  it('coalesces engagement keyed calculations and clears rejection', async () => {
    const cache = new EngagementStatsCache<number>() as EngagementStatsCache<number> & { runSingleflight: (key: string, loader: () => Promise<number>) => Promise<number> }
    let release!: (value: number) => void
    const loader = jest.fn(() => new Promise<number>(resolve => { release = resolve }))
    const requests = Array.from({ length: 50 }, () => cache.runSingleflight('same', loader))
    expect(loader).toHaveBeenCalledTimes(1)
    release(5)
    await expect(Promise.all(requests)).resolves.toEqual(Array(50).fill(5))
    const retry = jest.fn().mockRejectedValueOnce(new Error('aggregate failed')).mockResolvedValueOnce(7)
    await expect(cache.runSingleflight('retry', retry)).rejects.toThrow('aggregate failed')
    await expect(cache.runSingleflight('retry', retry)).resolves.toBe(7)
  })

  it('does not block engagement calculations for different keys', async () => {
    const cache = new EngagementStatsCache<number>() as EngagementStatsCache<number> & { runSingleflight: (key: string, loader: () => Promise<number>) => Promise<number> }
    let release!: (value: number) => void
    const first = cache.runSingleflight('a', () => new Promise<number>(resolve => { release = resolve }))
    await expect(cache.runSingleflight('b', async () => 2)).resolves.toBe(2)
    release(1)
    await expect(first).resolves.toBe(1)
  })

  it('rejects invalid concurrency instead of silently skipping tasks', async () => {
    await expect(runWithConcurrency([async () => 1], Number.NaN)).rejects.toThrow('concurrency must be a finite positive number')
  })

  it('stops consuming new provider tasks after first rejection', async () => {
    const started: number[] = []
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const tasks = Array.from({ length: 100 }, (_, index) => async () => { started.push(index); if (index === 0) throw new Error('provider failed'); await gate; return index })
    const result = runWithConcurrency(tasks, 10)
    await Promise.resolve()
    release()
    await expect(result).rejects.toThrow('provider failed')
    expect(started).toEqual(Array.from({ length: 10 }, (_, index) => index))
  })
  it('retains the first observed provider failure while started workers settle', async () => {
    const started: number[] = []
    let rejectZero!: (error: Error) => void
    let rejectOne!: (error: Error) => void
    const zero = new Promise<number>((_, reject) => { rejectZero = reject })
    const one = new Promise<number>((_, reject) => { rejectOne = reject })
    const tasks = Array.from({ length: 20 }, (_, index) => async () => {
      started.push(index)
      if (index === 0) return zero
      if (index === 1) return one
      return index
    })

    const result = runWithConcurrency(tasks, 2)
    rejectOne(new Error('first observed'))
    await Promise.resolve()
    rejectZero(new Error('later failure'))

    await expect(result).rejects.toThrow('first observed')
    expect(started).toEqual([0, 1])
  })
})
