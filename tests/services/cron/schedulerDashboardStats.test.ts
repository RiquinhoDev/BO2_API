const mockRebuildDashboardStats = jest.fn()
const mockBuildDashboardStats = jest.fn()

jest.mock('../../../src/jobs/rebuildDashboardStats.job', () => ({
  __esModule: true,
  default: { run: mockRebuildDashboardStats },
}))

jest.mock('../../../src/services/dashboardStatsBuilder.service', () => ({
  __esModule: true,
  buildDashboardStats: mockBuildDashboardStats,
}))

import { CronManagementService } from '../../../src/services/cron/scheduler'

type SpecificJobResult = {
  success: boolean
  stats: { errors: number }
  errorMessage?: string
}

describe('CronManagementService dashboard rebuild execution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not retry through the builder when the loaded job fails', async () => {
    mockRebuildDashboardStats.mockRejectedValueOnce(new Error('rebuild failed'))
    const service = new CronManagementService()
    const executeSpecificJob = Reflect.get(service, 'executeSpecificJob').bind(service) as (
      job: { name: string },
    ) => Promise<SpecificJobResult>

    const result = await executeSpecificJob({ name: 'RebuildDashboardStats' })

    expect(mockRebuildDashboardStats).toHaveBeenCalledTimes(1)
    expect(mockBuildDashboardStats).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: false,
      stats: { errors: 1 },
      errorMessage: 'rebuild failed',
    })
  })
})
