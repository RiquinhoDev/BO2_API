import express from 'express'
import request from 'supertest'
import analyticsCacheService from '../../src/services/analytics/analyticsCache.service'
import analyticsCalculatorService from '../../src/services/analytics/analyticsCalculator.service'
import Product from '../../src/models/product/Product'
import { createErrorHandling, type ErrorLogEvent } from '../../src/security/errorHandling'

jest.mock('../../src/services/analytics/analyticsCache.service', () => ({
  __esModule: true,
  default: {
    getOrCalculateMetrics: jest.fn(),
    invalidateAll: jest.fn(),
    invalidateProduct: jest.fn(),
    invalidatePlatform: jest.fn(),
    getCacheStats: jest.fn(),
  },
}))
jest.mock('../../src/services/analytics/analyticsCalculator.service', () => ({
  __esModule: true,
  default: {
    generateCumulativeTimeSeries: jest.fn(),
    generateNewStudentsTimeSeries: jest.fn(),
  },
}))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}))

import businessAnalyticsRouter from '../../src/routes/businessAnalytics.routes'

const cache = analyticsCacheService as jest.Mocked<typeof analyticsCacheService>
const calculator = analyticsCalculatorService as jest.Mocked<typeof analyticsCalculatorService>
const findProducts = Product.find as jest.Mock
const marker = { __bo2_offline_loopback: '1' }

function buildApp(events: ErrorLogEvent[] = []) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'business-analytics-correlation-id',
    logError: event => events.push(event),
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/business-analytics', businessAnalyticsRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  cache.getOrCalculateMetrics.mockResolvedValue({
    totalStudents: 0,
    activeStudents: 0,
    newStudents: 0,
    churnedStudents: 0,
    totalRevenue: 0,
    mrr: 0,
    arr: 0,
    avgLTV: 0,
    avgOrderValue: 0,
    churnRate: 0,
    retentionRate: 0,
    growthRate: 0,
    avgEngagement: 0,
  })
  calculator.generateCumulativeTimeSeries.mockResolvedValue([])
  calculator.generateNewStudentsTimeSeries.mockResolvedValue([])
  findProducts.mockResolvedValue([])
  cache.invalidateAll.mockResolvedValue(2)
  cache.getCacheStats.mockResolvedValue({
    total: 0, expired: 0, needsRefresh: 0, valid: 0, byPeriod: {},
    oldest: undefined, newest: undefined,
  })
})

afterEach(() => jest.restoreAllMocks())

test.each([
  ['GET', '/api/business-analytics/overview', 'BUSINESS_ANALYTICS_OVERVIEW_FAILED', () => cache.getOrCalculateMetrics.mockRejectedValueOnce(new Error('mongo failed alice@example.test token=secret'))],
  ['GET', '/api/business-analytics/products/comparison', 'BUSINESS_ANALYTICS_COMPARISON_FAILED', () => findProducts.mockRejectedValueOnce(new Error('mongo failed alice@example.test token=secret'))],
  ['POST', '/api/business-analytics/cache/invalidate', 'BUSINESS_ANALYTICS_CACHE_INVALIDATION_FAILED', () => cache.invalidateAll.mockRejectedValueOnce(new Error('redis failed alice@example.test token=secret'))],
  ['GET', '/api/business-analytics/cache/stats', 'BUSINESS_ANALYTICS_CACHE_STATS_FAILED', () => cache.getCacheStats.mockRejectedValueOnce(new Error('redis failed alice@example.test token=secret'))],
] as const)('%s %s exposes only the canonical error contract', async (method, path, code, arrange) => {
  arrange()
  const events: ErrorLogEvent[] = []
  let pending = method === 'POST'
    ? request(buildApp(events)).post(path).send({ all: true })
    : request(buildApp(events)).get(path)
  pending = pending.query(marker)
  const response = await pending.expect(500)

  expect(response.body).toEqual({
    success: false,
    code,
    message: expect.any(String),
    correlationId: 'business-analytics-correlation-id',
  })
  expect(response.text).not.toContain('mongo failed')
  expect(response.text).not.toContain('redis failed')
  expect(response.text).not.toContain('alice@example.test')
  expect(response.text).not.toContain('secret')
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ code })
  expect(events[0].detail).toContain('[REDACTED_EMAIL]')
  expect(events[0].detail).toContain('token=[REDACTED]')
})

test('overview preserves its success envelope', async () => {
  const response = await request(buildApp()).get('/api/business-analytics/overview').query(marker).expect(200)
  expect(response.body).toMatchObject({
    success: true,
    data: { kpis: expect.any(Object), timeSeries: expect.any(Object), breakdown: expect.any(Object) },
    meta: { cached: false, version: '1.0.0' },
  })
})

test('product comparison preserves its success envelope', async () => {
  const response = await request(buildApp()).get('/api/business-analytics/products/comparison').query(marker).expect(200)
  expect(response.body).toMatchObject({
    success: true,
    data: { comparison: { products: [], totals: expect.any(Object) }, timeSeries: { series: [] } },
    meta: { version: '1.0.0' },
  })
})

test('cache invalidation preserves its success envelope', async () => {
  const response = await request(buildApp()).post('/api/business-analytics/cache/invalidate').query(marker).send({ all: true }).expect(200)
  expect(response.body).toEqual({ success: true, data: { deletedCount: 2, message: '2 cache(s) invalidado(s)' } })
})

test('cache stats preserves its success envelope', async () => {
  const response = await request(buildApp()).get('/api/business-analytics/cache/stats').query(marker).expect(200)
  expect(response.body).toEqual({
    success: true,
    data: { total: 0, expired: 0, needsRefresh: 0, valid: 0, byPeriod: {} },
  })
})