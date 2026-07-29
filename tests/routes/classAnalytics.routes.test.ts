import express from 'express'
import request from 'supertest'

const extractedHandler = (name: string) =>
  (input: { params: object; query: object }, _req: unknown, res: express.Response) => {
    res.json({
      source: 'class-analytics-boundary',
      handler: name,
      input,
    })
  }

const legacyHandler = (name: string): express.RequestHandler =>
  (_req, res) => {
    res.json({
      source: 'legacy-analytics-controller',
      handler: name,
    })
  }

jest.mock(
  '../../src/controllers/analytics/classAnalytics.controller',
  () => ({
    classAnalyticsController: {
      getClassAnalytics: extractedHandler('getClassAnalytics'),
      recalculateClassScores: extractedHandler('recalculateClassScores'),
      getOutdatedClasses: extractedHandler('getOutdatedClasses'),
      getHealthScore: extractedHandler('getHealthScore'),
      getEngagementDistribution: extractedHandler(
        'getEngagementDistribution',
      ),
      getClassAlerts: extractedHandler('getClassAlerts'),
    },
  }),
)

jest.mock(
  '../../src/services/analytics/classQuickStats.runtime',
  () => ({
    getClassQuickStats: extractedHandler('getClassQuickStats'),
  }),
)

jest.mock(
  '../../src/services/analytics/globalAnalytics.runtime',
  () => ({
    getGlobalAnalytics: extractedHandler('getGlobalAnalytics'),
  }),
)

jest.mock(
  '../../src/services/analytics/classComparison.runtime',
  () => ({
    compareClasses: extractedHandler('compareClasses'),
  }),
)

jest.mock('../../src/controllers/analytics.controller', () => ({
  analyticsController: {
    getClassAnalytics: legacyHandler('getClassAnalytics'),
    recalculateClassScores: legacyHandler('recalculateClassScores'),
    recalculateIndividualScores: legacyHandler('recalculateIndividualScores'),
    getHealthScore: legacyHandler('getHealthScore'),
    getEngagementDistribution: legacyHandler('getEngagementDistribution'),
    getClassAlerts: legacyHandler('getClassAlerts'),
    getOutdatedClasses: legacyHandler('getOutdatedClasses'),
    getBenchmarks: legacyHandler('getBenchmarks'),
    getOpportunities: legacyHandler('getOpportunities'),
    getMultiPlatformAnalytics: legacyHandler('getMultiPlatformAnalytics'),
  },
}))

import analyticsRouter from '../../src/routes/analytics.routes'

const createTestApp = () => {
  const app = express()
  app.use(analyticsRouter)
  return app
}

describe('class analytics routes', () => {
  it.each([
    ['get', '/class/class-1', 'getClassAnalytics'],
    ['post', '/class/class-1/recalculate', 'recalculateClassScores'],
    ['get', '/class/class-1/health', 'getHealthScore'],
    ['get', '/health-score/class-1', 'getHealthScore'],
    ['get', '/class/class-1/engagement', 'getEngagementDistribution'],
    ['get', '/class/class-1/alerts', 'getClassAlerts'],
    ['get', '/outdated', 'getOutdatedClasses'],
  ] as const)(
    'mounts %s %s through the extracted %s handler',
    async (method, path, handler) => {
      const response = await request(createTestApp())
        [method](`${path}?__bo2_offline_loopback=1`)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        source: 'class-analytics-boundary',
        handler,
      })
    },
  )

  it('mounts quick stats through its extracted boundary', async () => {
    const response = await request(createTestApp())
      .get('/class/class-1/quick?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'getClassQuickStats',
      input: {
        params: { classId: 'class-1' },
        query: {},
      },
    })
  })

  it('mounts global analytics through its extracted boundary', async () => {
    const response = await request(createTestApp())
      .get('/global?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'getGlobalAnalytics',
      input: {
        params: {},
        query: {},
      },
    })
  })

  it('mounts class comparison through its extracted boundary', async () => {
    const response = await request(createTestApp())
      .get(
        '/compare?classIds=class-a,class-b&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'compareClasses',
      input: {
        params: {},
        query: { classIds: ['class-a', 'class-b'] },
      },
    })
  })

  it('keeps handlers outside the extracted slices on the legacy controller', async () => {
    const response = await request(createTestApp())
      .get('/benchmarks?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      source: 'legacy-analytics-controller',
      handler: 'getBenchmarks',
    })
  })
})
