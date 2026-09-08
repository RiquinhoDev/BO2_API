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
    ['AcTagWatch', 'hotmart', 'ac-tag-watch', 'implemented'],
    ['DailyPipeline', 'pipeline', 'daily-pipeline', 'implemented'],
    ['DiscordScheduledMessages', 'discord', 'discord-scheduled-messages', 'implemented'],
    ['CronExecutionCleanup', 'hotmart', 'cron-execution-cleanup', 'implemented'],
    ['AchievementEvaluation', 'hotmart', 'achievement-evaluation', 'implemented'],
    ['WeeklyTagSnapshot', 'hotmart', 'weekly-tag-snapshot', 'implemented'],
    ['RenewalAcSync', 'hotmart', 'renewal-ac-sync', 'implemented'],
    ['RenewalOfferSync', 'hotmart', 'renewal-offer-sync', 'implemented'],
    ['GuruTrialCheck', 'guru', 'guru-trial-check', 'implemented'],
    ['StandardSync', 'hotmart', 'unsupported', 'blocked'],
  ] as const)('%s/%s resolves to %s', (name, syncType, capability, status) => {
    const result = getCronManualCapability(job(name, syncType))
    expect(result.id).toBe(capability)
    expect(result.status).toBe(status)
  })

  test('does not grant weekly capability to a name containing the canonical name', () => {
    const result = getCronManualCapability(job('FooWeeklyTagSnapshot'))
    expect(result.id).toBe('unsupported')
    expect(result.status).toBe('blocked')
  })

  test('does not grant Renewal AC capability to a name containing the canonical name', () => {
    const result = getCronManualCapability(job('BackupRenewalAcSync'))
    expect(result.id).toBe('unsupported')
    expect(result.status).toBe('blocked')
  })

  test('does not grant Renewal Offer capability to a name containing the canonical name', () => {
    const result = getCronManualCapability(job('BackupRenewalOfferSync'))
    expect(result.id).toBe('unsupported')
    expect(result.status).toBe('blocked')
  })

  test('exposes exact bounded Renewal Offer capability metadata', () => {
    const result = getCronManualCapability(job('RenewalOfferSync'))

    expect(result).toEqual(expect.objectContaining({
      id: 'renewal-offer-sync',
      status: 'implemented',
      operation: 'cron-job',
      cap: {
        status: 'verified',
        reason: 'renewal-offer-sync-max-provider-sales-and-mutations',
        limit: 20_000,
      },
      idempotency: expect.objectContaining({ status: 'verified' }),
      killSwitch: {
        status: 'verified',
        reason: 'RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED',
      },
      dryRun: expect.objectContaining({ status: 'verified' }),
    }))
  })

  test('does not grant Guru capability to a name containing the canonical name', () => {
    const result = getCronManualCapability(job('NightlyGuruTrialCheck', 'guru'))
    expect(result.id).toBe('unsupported')
    expect(result.status).toBe('blocked')
  })

  test('exposes the exact bounded Guru capability metadata', () => {
    const result = getCronManualCapability(job('GuruTrialCheck', 'guru'))

    expect(result).toEqual(expect.objectContaining({
      id: 'guru-trial-check',
      status: 'implemented',
      operation: 'cron-job',
      cap: expect.objectContaining({ status: 'verified', limit: 20_000 }),
      idempotency: expect.objectContaining({ status: 'verified' }),
      killSwitch: expect.objectContaining({
        status: 'verified',
        reason: 'GURU_TRIAL_MANUAL_EXECUTION_ENABLED',
      }),
      dryRun: expect.objectContaining({ status: 'verified' }),
    }))
  })

  test('exposes bounded Renewal AC capability metadata with canonical identity', () => {
    const result = getCronManualCapability(job('RenewalAcSync'))

    expect(result).toEqual(expect.objectContaining({
      id: 'renewal-ac-sync',
      status: 'implemented',
      operation: 'cron-job',
      cap: expect.objectContaining({ status: 'verified' }),
      idempotency: expect.objectContaining({ status: 'verified' }),
      killSwitch: expect.objectContaining({
        status: 'verified',
        reason: 'RENEWAL_AC_MANUAL_EXECUTION_ENABLED',
      }),
      dryRun: expect.objectContaining({ status: 'verified' }),
    }))
    expect(result.identity(job('RenewalAcSync'))).toBe('cron-job:507f1f77bcf86cd799439011')
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

  test('exposes the exact bounded achievement evaluation capability metadata', () => {
    const result = getCronManualCapability(job('AchievementEvaluation'))

    expect(result).toEqual(expect.objectContaining({
      id: 'achievement-evaluation',
      status: 'implemented',
      operation: 'cron-job',
      cap: {
        status: 'verified',
        reason: 'achievement-evaluation-max-users',
        limit: 20_000,
      },
      idempotency: {
        status: 'verified',
        reason: 'composite-execution-durable-receipt-and-owner-fence',
      },
      killSwitch: {
        status: 'verified',
        reason: 'ACHIEVEMENT_EVALUATION_MUTABLE_EXECUTION_ENABLED',
      },
      dryRun: {
        status: 'verified',
        reason: 'dry-run-no-provider-or-local-mutation',
      },
    }))
  })

  test('exposes the exact bounded weekly snapshot capability metadata', () => {
    const result = getCronManualCapability(job('WeeklyTagSnapshot'))

    expect(result).toEqual(expect.objectContaining({
      id: 'weekly-tag-snapshot',
      status: 'implemented',
      operation: 'cron-job',
      cap: {
        status: 'verified',
        reason: 'weekly-tag-snapshot-max-contacts',
        limit: 20_000,
      },
      idempotency: {
        status: 'verified',
        reason: 'composite-execution-durable-receipt-and-owner-fence',
      },
      killSwitch: {
        status: 'verified',
        reason: 'WEEKLY_TAG_SNAPSHOT_MUTABLE_EXECUTION_ENABLED',
      },
      dryRun: {
        status: 'verified',
        reason: 'dry-run-no-provider-or-local-mutation',
      },
    }))
    expect(result.identity(job('WeeklyTagSnapshot'))).toBe('weekly-tag-snapshot')
  })

  test('view exposes mutable state and backend blocked reason for disabled implemented jobs', () => {
    expect(cronManualExecutionView(job('CronExecutionCleanup'), false)).toMatchObject({
      capability: 'cron-execution-cleanup',
      status: 'implemented',
      mutableEnabled: false,
      dryRunSupported: true,
      blockedReason: 'Execução mutável desativada pelo backend',
    })
    expect(cronManualExecutionView(job('CronExecutionCleanup'), true)).toMatchObject({
      mutableEnabled: true,
    })
    expect(cronManualExecutionView(job('AchievementEvaluation'), false)).toMatchObject({
      capability: 'achievement-evaluation',
      status: 'implemented',
      mutableEnabled: false,
      dryRunSupported: true,
      blockedReason: 'Execução mutável desativada pelo backend',
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
