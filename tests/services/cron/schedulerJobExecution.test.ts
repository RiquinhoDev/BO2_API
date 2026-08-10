import {
  CronExecutionDependencies,
  CronExecutionJob,
  CronJobExecutor
} from '../../../src/services/cron/scheduler/jobExecution'
import { CronNotificationJob, createLoggingCronNotification } from '../../../src/services/cron/scheduler/notificationPort'

const stats = { total: 4, inserted: 1, updated: 2, errors: 0, skipped: 1 }

const createJob = (events: string[] = []): CronExecutionJob => ({
  _id: { toString: () => 'nightly-sync' },
  name: 'NightlySync',
  syncType: 'hotmart',
  notifications: {
    enabled: true,
    emailOnSuccess: true,
    emailOnFailure: true,
    recipients: ['ops@example.test']
  },
  recordExecution: jest.fn(async () => {
    events.push('job-save')
  })
})

const createDependencies = (events: string[] = []): jest.Mocked<CronExecutionDependencies> => ({
  dispatch: jest.fn<
    ReturnType<CronExecutionDependencies['dispatch']>,
    Parameters<CronExecutionDependencies['dispatch']>
  >(async () => {
    events.push('dispatch')
    return { success: true, stats }
  }),
  saveHistory: jest.fn<
    ReturnType<CronExecutionDependencies['saveHistory']>,
    Parameters<CronExecutionDependencies['saveHistory']>
  >(async () => {
    events.push('history-create')
  }),
  notify: jest.fn<
    ReturnType<CronExecutionDependencies['notify']>,
    Parameters<CronExecutionDependencies['notify']>
  >(async () => {
    events.push('notify')
  }),
  now: jest.fn().mockReturnValueOnce(1_000).mockReturnValue(3_400),
  reportError: jest.fn()
})

describe('CronJobExecutor', () => {
  it('preserves dispatch, job save, history and notification order', async () => {
    const events: string[] = []
    const job = createJob(events)
    const executor = new CronJobExecutor(createDependencies(events))

    await expect(executor.execute(job, { triggeredBy: 'MANUAL', isolateRecordFailure: true })).resolves.toEqual({
      success: true,
      duration: 2,
      stats
    })
    expect(events).toEqual(['dispatch', 'job-save', 'history-create', 'notify'])
    expect(job.recordExecution).toHaveBeenCalledWith(stats, 'success', 2, 'MANUAL', undefined)
  })

  it('persists a returned business failure without converting its stats', async () => {
    const dependencies = createDependencies()
    dependencies.dispatch.mockResolvedValue({ success: false, stats: { ...stats, errors: 2 }, errorMessage: 'partial' })
    const job = createJob()
    const executor = new CronJobExecutor(dependencies)

    const result = await executor.execute(job, { triggeredBy: 'CRON', isolateRecordFailure: false })

    expect(result).toMatchObject({ success: false, stats: { errors: 2 }, errorMessage: 'partial' })
    expect(job.recordExecution).toHaveBeenCalledWith(expect.objectContaining({ errors: 2 }), 'failed', 2, 'CRON', 'partial')
    expect(dependencies.saveHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorMessage: 'partial' }))
  })

  it.each([
    [new Error('boom'), 'boom'],
    ['broken', 'broken']
  ])('normalizes a thrown dispatcher value: %p', async (failure, message) => {
    const dependencies = createDependencies()
    dependencies.dispatch.mockRejectedValue(failure)
    const job = createJob()
    const executor = new CronJobExecutor(dependencies)

    await expect(executor.execute(job, { triggeredBy: 'MANUAL', isolateRecordFailure: true })).resolves.toEqual({
      success: false,
      duration: 2,
      stats: { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
      errorMessage: message
    })
  })

  it('isolates manual recordExecution failure and continues history and notification', async () => {
    const dependencies = createDependencies()
    const job = createJob()
    const recordExecution = jest.mocked(job.recordExecution)
    recordExecution.mockRejectedValue(new Error('save failed'))
    const executor = new CronJobExecutor(dependencies)

    const result = await executor.execute(job, { triggeredBy: 'MANUAL', isolateRecordFailure: true })

    expect(result.success).toBe(true)
    expect(dependencies.saveHistory).toHaveBeenCalledTimes(1)
    expect(dependencies.notify).toHaveBeenCalledTimes(1)
    expect(dependencies.reportError).toHaveBeenCalledWith(expect.stringContaining('recordExecution'), expect.any(Error))
  })

  it('converts a scheduled save failure into the existing failure path', async () => {
    const dependencies = createDependencies()
    const job = createJob()
    const recordExecution = jest.mocked(job.recordExecution)
    recordExecution.mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce(undefined)
    const executor = new CronJobExecutor(dependencies)

    const result = await executor.execute(job, { triggeredBy: 'CRON', isolateRecordFailure: false })

    expect(result).toMatchObject({ success: false, errorMessage: 'save failed' })
    expect(recordExecution).toHaveBeenCalledTimes(2)
    expect(dependencies.notify).not.toHaveBeenCalled()
  })

  it('isolates history failure from a successful execution', async () => {
    const dependencies = createDependencies()
    dependencies.saveHistory.mockRejectedValue(new Error('history failed'))
    const executor = new CronJobExecutor(dependencies)

    const result = await executor.execute(createJob(), { triggeredBy: 'MANUAL', isolateRecordFailure: true })

    expect(result.success).toBe(true)
    expect(dependencies.notify).toHaveBeenCalledTimes(1)
    expect(dependencies.reportError).toHaveBeenCalledWith(expect.stringContaining('histórico'), expect.any(Error))
  })

  it('does not notify when notifications are disabled', async () => {
    const dependencies = createDependencies()
    const job = createJob()
    job.notifications.enabled = false
    const executor = new CronJobExecutor(dependencies)

    await executor.execute(job, { triggeredBy: 'MANUAL', isolateRecordFailure: true })

    expect(dependencies.notify).not.toHaveBeenCalled()
  })
})

describe('logging cron notification', () => {
  const notificationJob: CronNotificationJob = {
    name: 'NightlySync',
    notifications: {
      enabled: true,
      emailOnSuccess: true,
      emailOnFailure: false,
      recipients: ['ops@example.test'],
      webhookUrl: 'https://example.test/hook'
    }
  }

  it('keeps delivery as a no-op while logging an enabled success notification', async () => {
    const log = jest.fn()
    const port = createLoggingCronNotification({ info: log })

    await port.notify(notificationJob, true, stats)

    expect(log).toHaveBeenCalledWith('Cron notification (delivery disabled)', expect.objectContaining({
      job: 'NightlySync',
      success: true,
      recipients: ['ops@example.test'],
      webhookUrl: 'https://example.test/hook'
    }))
  })

  it('does not log a failure when emailOnFailure is disabled', async () => {
    const log = jest.fn()
    const port = createLoggingCronNotification({ info: log })

    await port.notify(notificationJob, false, stats, 'failed')

    expect(log).not.toHaveBeenCalled()
  })
})
