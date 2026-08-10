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
})
