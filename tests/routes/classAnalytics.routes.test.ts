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

jest.mock(
  '../../src/services/analytics/classOpportunities.runtime',
  () => ({
    getClassOpportunities: extractedHandler('getClassOpportunities'),
  }),
)

jest.mock(
  '../../src/services/analytics/benchmarkAnalytics.runtime',
  () => ({
    getBenchmarkAnalytics: extractedHandler('getBenchmarkAnalytics'),
  }),
)

jest.mock(
  '../../src/services/analytics/individualScoreRecalculation.runtime',
  () => ({
    recalculateIndividualScores:
      extractedHandler('recalculateIndividualScores'),
  }),
)

jest.mock(
  '../../src/services/analytics/multiPlatformAnalytics.runtime',
  () => ({
    getMultiPlatformAnalytics:
      extractedHandler('getMultiPlatformAnalytics'),
  }),
)

import analyticsRouter from '../../src/routes/analytics.routes'

const createTestApp = () => {
  const app = express()
  app.use(express.json())
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

  it('mounts individual score recalculation through its extracted strict boundary', async () => {
    const response = await request(createTestApp())
      .post(
        '/class/class-1/recalculate-individual?__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'recalculateIndividualScores',
      input: {
        params: { classId: 'class-1' },
        query: {},
        body: {},
      },
    })
  })

  it('rejects unknown individual score recalculation query fields at the route', async () => {
    const response = await request(createTestApp())
      .post(
        '/class/class-1/recalculate-individual?extra=value&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(400)
  })

  it('rejects unknown individual score recalculation body fields at the route', async () => {
    const response = await request(createTestApp())
      .post(
        '/class/class-1/recalculate-individual?__bo2_offline_loopback=1',
      )
      .send({ extra: 'value' })

    expect(response.status).toBe(400)
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

  it('mounts class opportunities through its extracted boundary', async () => {
    const response = await request(createTestApp())
      .get(
        '/opportunities/class-a?__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'getClassOpportunities',
      input: {
        params: { classId: 'class-a' },
        query: {},
      },
    })
  })

  it('rejects unknown class-opportunities query fields at the route', async () => {
    const response = await request(createTestApp())
      .get(
        '/opportunities/class-a?extra=value&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(400)
  })

  it('mounts benchmarks through its extracted strict boundary', async () => {
    const response = await request(createTestApp())
      .get('/benchmarks?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'getBenchmarkAnalytics',
      input: {
        params: {},
        query: {},
      },
    })
  })

  it('rejects unknown benchmark query fields at the route', async () => {
    const response = await request(createTestApp())
      .get('/benchmarks?extra=value&__bo2_offline_loopback=1')

    expect(response.status).toBe(400)
  })

  it('mounts multi-platform analytics through its extracted strict boundary', async () => {
    const response = await request(createTestApp())
      .get('/multi-platform?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      source: 'class-analytics-boundary',
      handler: 'getMultiPlatformAnalytics',
    })
    expect(response.body.input).toEqual({
      params: {},
      query: {},
      body: {},
    })
  })

  it('rejects unknown multi-platform query fields at the route', async () => {
    const response = await request(createTestApp())
      .get('/multi-platform?extra=value&__bo2_offline_loopback=1')

    expect(response.status).toBe(400)
  })

  it('rejects unknown multi-platform body fields at the route', async () => {
    const response = await request(createTestApp())
      .get('/multi-platform?__bo2_offline_loopback=1')
      .send({ extra: 'value' })

    expect(response.status).toBe(400)
  })
})
