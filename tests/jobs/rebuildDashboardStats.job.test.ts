const mockBuildDashboardStats = jest.fn()

jest.mock('../../src/services/dashboardStatsBuilder.service', () => ({
  buildDashboardStats: mockBuildDashboardStats,
}))

import { rebuildDashboardStatsManual } from '../../src/jobs/rebuildDashboardStats.job'

describe('rebuildDashboardStatsManual', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('wraps a null rebuild rejection without exposing the raw value', async () => {
    mockBuildDashboardStats.mockRejectedValueOnce(null)

    await expect(rebuildDashboardStatsManual()).rejects.toMatchObject({
      message: 'Erro ao rebuild dashboard stats: Erro desconhecido',
    })
  })

  it('does not expose an arbitrary rejection value as the error cause', async () => {
    const secret = 'token=super-secret'
    mockBuildDashboardStats.mockRejectedValueOnce(secret)

    const rejection = await rebuildDashboardStatsManual().catch(error => error)

    expect(rejection).toMatchObject({
      message: 'Erro ao rebuild dashboard stats: Erro desconhecido',
    })
    expect(rejection.cause).toBeUndefined()
    expect(JSON.stringify(rejection)).not.toContain(secret)
  })

  it('preserves an Error cause for diagnostics', async () => {
    const cause = new Error('database unavailable')
    mockBuildDashboardStats.mockRejectedValueOnce(cause)

    await expect(rebuildDashboardStatsManual()).rejects.toMatchObject({
      message: 'Erro ao rebuild dashboard stats: database unavailable',
      cause,
    })
  })
})
