import express from 'express'
import request from 'supertest'

const mockRebuildDashboardStats = jest.fn()

jest.mock('../../src/jobs/rebuildDashboardStats.job', () => ({
  __esModule: true,
  rebuildDashboardStatsManual: mockRebuildDashboardStats,
}))

jest.mock('../../src/controllers/dashboard.controller', () => ({
  getDashboardStats: jest.fn(),
  getProductsBreakdown: jest.fn(),
  getEngagementDistribution: jest.fn(),
  compareProducts: jest.fn(),
  getDashboardStatsV3: jest.fn(),
  searchDashboard: jest.fn(),
}))

jest.mock('../../src/controllers/dashboardQuick.controller', () => ({
  getProductComparison: jest.fn(),
  getEngagementHeatmap: jest.fn(),
  getProductsBreakdown: jest.fn(),
}))

import dashboardRouter from '../../src/routes/dashboardRoutes'

function buildApp() {
  const app = express()
  app.use('/dashboard', dashboardRouter)
  return app
}

describe('POST /dashboard/stats/v3/rebuild', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('reports success only after the rebuild completes', async () => {
    mockRebuildDashboardStats.mockResolvedValueOnce({ success: true })

    const response = await request(buildApp())
      .post('/dashboard/stats/v3/rebuild')
      .query({ __bo2_offline_loopback: '1' })
      .expect(200)

    expect(mockRebuildDashboardStats).toHaveBeenCalledTimes(1)
    expect(response.body).toEqual({
      success: true,
      message: 'Dashboard Stats reconstruídos com sucesso.',
    })
  })

  it('returns a rejected rebuild as an HTTP failure', async () => {
    mockRebuildDashboardStats.mockRejectedValueOnce(new Error('rebuild failed'))

    const response = await request(buildApp())
      .post('/dashboard/stats/v3/rebuild')
      .query({ __bo2_offline_loopback: '1' })
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      error: 'rebuild failed',
    })
  })

  it('does not expose an arbitrary rejection value', async () => {
    mockRebuildDashboardStats.mockRejectedValueOnce('token=super-secret')

    const response = await request(buildApp())
      .post('/dashboard/stats/v3/rebuild')
      .query({ __bo2_offline_loopback: '1' })
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      error: 'Erro desconhecido',
    })
  })
})
