import {
  createCronTagsCompatibilityService,
} from '../../../src/services/cron/cronTagsCompatibility.service'
import type {
  CronExecutionView,
  CronJobView,
  CronTagsRepositoryPort,
  CronTagsSchedulerPort,
} from '../../../src/services/cron/cronTagsCompatibility.types'

const job: CronJobView = {
  _id: '507f1f77bcf86cd799439011',
  name: 'TAG_RULES_SYNC',
  description: 'Tag rules',
  syncType: 'pipeline',
  schedule: {
    cronExpression: '0 2 * * *',
    timezone: 'Europe/Lisbon',
    enabled: true,
  },
  syncConfig: {
    fullSync: true,
    includeProgress: true,
    includeTags: true,
    batchSize: 100,
  },
  tagRules: [],
  tagRuleOptions: {
    enabled: true,
    executeAllRules: true,
    runInParallel: false,
    stopOnError: false,
  },
  notifications: {
    enabled: false,
    emailOnSuccess: false,
    emailOnFailure: true,
    recipients: [],
  },
  retryPolicy: {
    maxRetries: 3,
    retryDelayMinutes: 30,
    exponentialBackoff: true,
  },
  isActive: true,
  nextRun: new Date('2026-07-30T02:00:00.000Z'),
  createdBy: '507f1f77bcf86cd799439010',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
  totalRuns: 4,
  successfulRuns: 3,
  failedRuns: 1,
}

const executions: CronExecutionView[] = [
  {
    _id: '507f1f77bcf86cd799439012',
    cronName: 'TAG_RULES_SYNC',
    executionType: 'automatic',
    status: 'success',
    startTime: new Date('2026-07-29T02:00:00.000Z'),
    endTime: new Date('2026-07-29T02:00:01.000Z'),
    duration: 1000,
    tagsApplied: 2,
    emailsSynced: 0,
    studentsProcessed: 4,
  },
]

function buildPorts() {
  const repository: CronTagsRepositoryPort = {
    findJobByName: jest.fn(async () => job),
    listActiveJobs: jest.fn(async () => [job]),
    listExecutions: jest.fn(async () => executions),
    getStatistics: jest.fn(async () => ({
      totalExecutions: 3,
      successRate: 50,
      avgDuration: 2000,
    })),
  }
  const scheduler: CronTagsSchedulerPort = {
    getJobById: jest.fn(async () => job),
    getNextExecutions: jest.fn(() => [
      new Date('2026-07-30T02:00:00.000Z'),
    ]),
    isActive: jest.fn(() => false),
    updateJob: jest.fn(async () => ({
      ...job,
      schedule: {
        ...job.schedule,
        cronExpression: '0 3 * * *',
        enabled: false,
      },
    })),
  }

  return { repository, scheduler }
}

test('updates the canonical job through the scheduler port', async () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService(ports)

  const result = await service.updateConfig({
    cronExpression: '0 3 * * *',
    isActive: false,
  })

  expect(ports.scheduler.updateJob).toHaveBeenCalledWith(
    '507f1f77bcf86cd799439011',
    {
      cronExpression: '0 3 * * *',
      enabled: false,
    },
  )
  expect(result.schedule.enabled).toBe(false)
})

test('reads bounded tag-rule history from the repository port', async () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService(ports)

  await expect(service.getHistory(20)).resolves.toEqual(executions)
  expect(ports.repository.listExecutions).toHaveBeenCalledWith({
    cronName: 'TAG_RULES_SYNC',
    limit: 20,
  })
})

test('delegates statistics to the scalable repository aggregation', async () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService({
    ...ports,
    now: () => new Date('2026-07-29T12:00:00.000Z'),
  })

  await expect(service.getStatistics(30)).resolves.toEqual({
    totalExecutions: 3,
    successRate: 50,
    avgDuration: 2000,
  })
  expect(ports.repository.getStatistics).toHaveBeenCalledWith({
    cronName: 'TAG_RULES_SYNC',
    since: new Date('2026-06-29T12:00:00.000Z'),
  })
})

test('builds status from canonical persistence and scheduler state', async () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService({
    ...ports,
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })

  const status = await service.getStatus()

  expect(status.stats).toEqual({
    totalJobs: 1,
    enabledJobs: 1,
    disabledJobs: 0,
    totalExecutions: 1,
    successRate: 75,
    schedulerActive: false,
  })
  expect(status.upcomingJobs).toEqual([
    {
      id: '507f1f77bcf86cd799439011',
      name: 'TAG_RULES_SYNC',
      syncType: 'pipeline',
      nextRun: new Date('2026-07-30T02:00:00.000Z'),
      minutesUntil: 1560,
    },
  ])
})

test('maps real execution history to the existing job-history contract', async () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService(ports)

  const result = await service.getJobHistory(
    '507f1f77bcf86cd799439011',
    20,
  )

  expect(result).toEqual({
    jobId: '507f1f77bcf86cd799439011',
    jobName: 'TAG_RULES_SYNC',
    totalRuns: 4,
    successfulRuns: 3,
    failedRuns: 1,
    successRate: 75,
    executions: [
      {
        _id: '507f1f77bcf86cd799439012',
        jobId: '507f1f77bcf86cd799439011',
        jobName: 'TAG_RULES_SYNC',
        status: 'success',
        startedAt: new Date('2026-07-29T02:00:00.000Z'),
        completedAt: new Date('2026-07-29T02:00:01.000Z'),
        duration: 1,
        stats: {
          total: 4,
          inserted: 0,
          updated: 4,
          errors: 0,
          skipped: 0,
        },
        triggeredBy: 'CRON',
        errorMessage: undefined,
      },
    ],
    count: 1,
    limit: 20,
  })
})

test('validates cron through the scheduler and returns a pure description', () => {
  const ports = buildPorts()
  const service = createCronTagsCompatibilityService(ports)

  expect(service.validateCronExpression('0 2 * * *')).toEqual({
    nextExecutions: [new Date('2026-07-30T02:00:00.000Z')],
    humanReadable: 'Todos os dias às 02:00',
  })
  expect(ports.scheduler.getNextExecutions).toHaveBeenCalledWith(
    '0 2 * * *',
    5,
  )
})
