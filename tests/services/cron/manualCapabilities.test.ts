import {
  cronManualExecutionView,
  getCronManualCapability,
  cronManualFingerprintPayload,
} from '../../../src/services/cron/scheduler/manualCapabilities'

const job = (name: string, syncType: string = 'hotmart', id = '507f1f77bcf86cd799439011') => ({
  _id: { toString: () => id },
  name,
  syncType,
  syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
  tagRules: [],
  tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
  __v: 3,
})

describe('manual cron capabilities', () => {
  test.each([
    ['DailyPipeline', 'pipeline', 'daily-pipeline', 'implemented'],
    ['DiscordScheduledMessages', 'discord', 'discord-scheduled-messages', 'implemented'],
    ['CronExecutionCleanup', 'hotmart', 'cron-execution-cleanup', 'implemented'],
    ['StandardSync', 'hotmart', 'unsupported', 'blocked'],
  ] as const)('%s/%s resolves to %s', (name, syncType, capability, status) => {
    const result = getCronManualCapability(job(name, syncType))
    expect(result.id).toBe(capability)
    expect(result.status).toBe(status)
  })

  test('exposes the exact bounded cleanup capability metadata', () => {
    const result = getCronManualCapability(job('CronExecutionCleanup'))

    expect(result).toEqual(expect.objectContaining({
      id: 'cron-execution-cleanup',
      status: 'implemented',
      operation: 'cron-job',
      cap: {
        status: 'verified',
        reason: 'cron-execution-cleanup-max-candidates',
        limit: 20_000,
      },
      idempotency: {
        status: 'verified',
        reason: 'composite-execution-durable-receipt-and-owner-fence',
      },
      killSwitch: {
        status: 'verified',
        reason: 'CRON_EXECUTION_CLEANUP_MUTABLE_EXECUTION_ENABLED',
      },
      dryRun: {
        status: 'verified',
        reason: 'dry-run-no-provider-or-local-mutation',
      },
    }))
    expect(result.identity(job('CronExecutionCleanup'))).toBe('cron-job:507f1f77bcf86cd799439011')
  })

  test('view exposes cleanup mutable state and blocked reason only for unsupported jobs', () => {
    expect(cronManualExecutionView(job('CronExecutionCleanup'), false)).toMatchObject({
      capability: 'cron-execution-cleanup',
      status: 'implemented',
      mutableEnabled: false,
      dryRunSupported: true,
    })
    expect(cronManualExecutionView(job('CronExecutionCleanup'), true)).toMatchObject({
      mutableEnabled: true,
    })
    expect(cronManualExecutionView(job('StandardSync'), false)).toMatchObject({
      capability: 'unsupported',
      status: 'blocked',
      mutableEnabled: false,
      blockedReason: expect.stringContaining('bloqueada'),
    })
  })

  test('fingerprint payload includes immutable job identity and execution config', () => {
    expect(cronManualFingerprintPayload(job('DiscordScheduledMessages', 'discord'))).toEqual({
      entryPoint: 'cron-job-trigger',
      resultContract: 'cron-execution',
      capability: 'discord-scheduled-messages',
      jobId: '507f1f77bcf86cd799439011',
      jobName: 'DiscordScheduledMessages',
      syncType: 'discord',
      version: 3,
      syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
    })
  })
})
