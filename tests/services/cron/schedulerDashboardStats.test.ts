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
import { cronJobDispatcher } from '../../../src/services/cron/scheduler/jobDispatcher'
import schedule from 'node-schedule'
import { CronExecution } from '../../../src/models'

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

    const result = await cronJobDispatcher.execute({
      _id: { toString: () => 'dashboard-stats-job' },
      name: 'RebuildDashboardStats',
      syncType: 'hotmart',
    })

    expect(mockRebuildDashboardStats).toHaveBeenCalledTimes(1)
    expect(mockBuildDashboardStats).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: false,
      stats: { errors: 1 },
      errorMessage: 'rebuild failed',
    })
  })
  it('persists the returned failure message for a scheduled run', async () => {
    mockRebuildDashboardStats.mockRejectedValueOnce(new Error('rebuild failed'))
    let scheduledCallback: (() => Promise<void>) | undefined
    jest.spyOn(schedule, 'scheduleJob').mockImplementation(((
      _expression: unknown,
      callback: () => Promise<void>,
    ) => {
      scheduledCallback = callback
      return { cancel: jest.fn() }
    }) as never)
    jest.spyOn(CronExecution, 'create').mockResolvedValue({} as never)
    const recordExecution = jest.fn().mockResolvedValue(undefined)
    const service = new CronManagementService()
    const scheduleJob = Reflect.get(service, 'scheduleJob').bind(service) as (
      job: {
        _id: { toString(): string }
        name: string
        isActive: boolean
        schedule: { enabled: boolean; cronExpression: string }
        notifications: {
          enabled: boolean
          emailOnSuccess: boolean
          emailOnFailure: boolean
          recipients: string[]
        }
        recordExecution: typeof recordExecution
      },
    ) => Promise<void>

    await scheduleJob({
      _id: { toString: () => 'dashboard-stats-job' },
      name: 'RebuildDashboardStats',
      isActive: true,
      schedule: { enabled: true, cronExpression: '0 3 * * *' },
      notifications: {
        enabled: true,
        emailOnSuccess: false,
        emailOnFailure: true,
        recipients: ['ops@example.test'],
      },
      recordExecution,
    })
    expect(scheduledCallback).toBeDefined()

    await scheduledCallback?.()

    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({ errors: 1 }),
      'failed',
      expect.any(Number),
      'CRON',
      'rebuild failed',
    )
    expect(CronExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        errorMessage: 'rebuild failed',
      }),
    )  })
})
