const mockScheduleJob = jest.fn()
jest.mock('node-schedule', () => ({ scheduleJob: mockScheduleJob }))
import scheduler, {
  CronManagementService,
  syncSchedulerService
} from '../../../src/services/cron/scheduler'
import { CronManagementService as FocusedCronManagementService } from '../../../src/services/cron/scheduler/service'

describe('scheduler public topology', () => {
  it('keeps one public singleton and exposes the focused service class', () => {
    expect(scheduler).toBe(syncSchedulerService)
    expect(CronManagementService).toBe(FocusedCronManagementService)
    expect(syncSchedulerService).toBeInstanceOf(FocusedCronManagementService)
  })

  it('does not register an independent timer for the daily renewal follow-up', async () => {
    const service = scheduler as unknown as { scheduleJob(job: unknown): Promise<void> }
    await service.scheduleJob({ name: 'RenewalPipeline', isActive: true, schedule: { enabled: true, cronExpression: '0 3 * * *' }, _id: 'synthetic' })
    expect(mockScheduleJob).not.toHaveBeenCalled()
  })
})
