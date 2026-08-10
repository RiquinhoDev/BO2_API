import express from 'express'
import request from 'supertest'

const mockAllowDiskUse = jest.fn()
const mockAggregate = jest.fn(() => ({ allowDiskUse: mockAllowDiskUse }))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    aggregate: mockAggregate,
  },
}))

import {
  clearEngagementCache,
  getGlobalEngagementStats,
} from '../../src/controllers/engagement.controller'

describe('global engagement cache', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-29T00:00:00.000Z'))

    const app = express()
    app.post('/clear', clearEngagementCache)
    await request(app)
      .post('/clear?__bo2_offline_loopback=1')
      .expect(200)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns the elapsed cache age from the stored timestamp', async () => {
    mockAllowDiskUse.mockResolvedValueOnce([{
      totalUsers: 1,
      averageScore: 80,
      MUITO_BAIXO: 0,
      BAIXO: 0,
      MEDIO: 0,
      ALTO: 0,
      MUITO_ALTO: 1,
      topPerformersCount: 1,
      needsAttentionCount: 0,
      hotmartUsers: 1,
      discordUsers: 0,
      curseducaUsers: 0,
      activeUsers: 1,
      inactiveUsers: 0,
    }])

    const app = express()
    app.get('/stats', getGlobalEngagementStats)

    await request(app)
      .get('/stats?__bo2_offline_loopback=1')
      .expect(200)

    jest.advanceTimersByTime(1_250)

    const cachedResponse = await request(app)
      .get('/stats?__bo2_offline_loopback=1')
      .expect(200)

    expect(cachedResponse.body.data.cached).toBe(true)
    expect(cachedResponse.body.data.cacheAge).toBe(1_250)
    expect(mockAggregate).toHaveBeenCalledTimes(1)
  })
})
