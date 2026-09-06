import {
  CronDispatchDependencies,
  CronDispatchJob,
  CronJobDispatcher,
  UniversalSyncRequest
} from '../../../src/services/cron/scheduler/jobDispatcher'

const emptyStats = { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }

const job = (name: string, syncType: CronDispatchJob['syncType'] = 'hotmart'): CronDispatchJob => ({
  _id: { toString: () => 'job-id' },
  name,
  syncType
})

const createDependencies = (): jest.Mocked<CronDispatchDependencies> => ({
  evaluateRules: jest.fn(async () => ({ success: true, total: 4, tagsApplied: 2 })),
  resetCounters: jest.fn(async () => ({ success: true, usersUpdated: 3 })),
  rebuildDashboardStats: jest.fn(async () => ({ success: true, totalStudents: 5 })),
  cleanupExecutions: jest.fn(async () => ({ success: true, deleted: 6 })),
  weeklyTagSnapshot: jest.fn(async () => ({ success: true, total: 7 })),
  clarezaRefresh: jest.fn(async () => ({ success: true, updated: 8 })),
  guruTrialCheck: jest.fn(async () => ({ success: true, skipped: 9 })),
  syncRenewalOffers: jest.fn(async () => ({ upserted: 2, deactivated: 1, unknownNames: ['x'] })),
  runScheduledMessages: jest.fn(async () => ({ checked: 5, sent: 2, skipped: [{ rule: 'r', reason: 'x' }] })),
  runDiscordRolesSync: jest.fn(async () => ({
    plan: { anomalyAborted: false, accountsDesired: 5, planned: 3, skippedDuplicates: 1 },
    execution: { applied: 2, failed: 1, notInGuild: 1 }
  })),
  runRenewalAcSync: jest.fn(async () => ({
    plan: { anomalyAborted: false, classChangesSeen: 5, planned: 3, blocked: 1, skippedDuplicates: 1 },
    execution: { applied: 2, failed: 1 }
  })),
  evaluateAchievements: jest.fn(async () => ({ total: 5, evaluated: 4, errors: 1 })),
  executeDailyPipeline: jest.fn(async () => ({
    success: true,
    summary: { totalUsers: 3, totalUserProducts: 4, engagementUpdated: 2 },
    errors: []
  })),
  fetchHotmart: jest.fn(async () => []),
  fetchCurseduca: jest.fn(async () => []),
  executeUniversalSync: jest.fn<Promise<unknown>, [UniversalSyncRequest]>(async () => ({
    success: true,
    stats: { ...emptyStats, total: 10 }
  }))
})

describe('CronJobDispatcher', () => {
  it.each([
    ['EvaluateRules', 'evaluateRules'],
    ['ResetCounters', 'resetCounters'],
    ['RebuildDashboardStats', 'rebuildDashboardStats'],
    ['CronExecutionCleanup', 'cleanupExecutions'],
    ['ClarezaRefresh', 'clarezaRefresh'],
    ['GuruTrialCheck', 'guruTrialCheck']
  ] as const)('dispatches %s to its dedicated runner', async (name, dependency) => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    await dispatcher.execute(job(`Nightly${name}`))

    expect(dependencies[dependency]).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch a job whose name only contains WeeklyTagSnapshot', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    await dispatcher.execute(job('FooWeeklyTagSnapshot'))

    expect(dependencies.weeklyTagSnapshot).not.toHaveBeenCalled()
    expect(dependencies.fetchHotmart).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch a job whose name only contains RenewalAcSync', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    await dispatcher.execute(job('BackupRenewalAcSync'))

    expect(dependencies.runRenewalAcSync).not.toHaveBeenCalled()
    expect(dependencies.fetchHotmart).toHaveBeenCalledTimes(1)
  })

  it('passes weekly dry-run phases and preserves the exact service data and stats', async () => {
    const dependencies = createDependencies()
    const serviceData = {
      success: true,
      totalStudents: 2,
      snapshotsCreated: 1,
      snapshotsUpdated: 1,
      changesDetected: 1,
      notificationsCreated: 1,
      duration: '1s',
      errors: 0,
      mode: 'ALL_CONTACTS' as const,
      dryRun: true as const,
      plan: {
        operation: 'weekly-tag-snapshot' as const,
        dryRun: true as const,
        scope: 'ALL_CONTACTS' as const,
        matching: 2,
        wouldSnapshot: 2,
        wouldNotify: 1,
        notificationDetails: 1,
        notificationsTruncated: false,
        cleanupCandidates: 0,
        cleanupSkipped: 0,
        cleanupTruncated: false,
        cleanupRemaining: 0,
        limit: 20_000,
        truncated: false,
        remaining: 0,
      },
    }
    dependencies.weeklyTagSnapshot.mockResolvedValueOnce({
      success: true,
      total: 2,
      inserted: 1,
      updated: 1,
      errors: 0,
      skipped: 0,
      dryRun: true,
      plan: serviceData.plan,
      data: serviceData,
    })
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    await expect(dispatcher.execute(job('WeeklyTagSnapshot'), {
      dryRun: true,
      phaseHooks,
    })).resolves.toEqual({
      success: true,
      stats: { total: 2, inserted: 1, updated: 1, errors: 0, skipped: 0 },
      dryRun: true,
      data: serviceData,
      plan: serviceData.plan,
    })
    expect(dependencies.weeklyTagSnapshot).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('normalizes renewal offers', async () => {
    const dispatcher = new CronJobDispatcher(createDependencies())

    await expect(dispatcher.execute(job('RenewalOfferSync'))).resolves.toEqual({
      success: true,
      stats: { total: 3, inserted: 0, updated: 2, errors: 0, skipped: 1 },
      errorMessage: undefined
    })
  })

  it('dispatches scheduled Discord messages instead of the synthetic Discord sync', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    const result = await dispatcher.execute(job('DiscordScheduledMessages', 'discord'))

    expect(dependencies.runScheduledMessages).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: true,
      stats: { total: 5, inserted: 2, updated: 0, errors: 0, skipped: 1 },
      errorMessage: 'r: x'
    })
  })

  it('normalizes Discord roles, renewal AC and achievements as partial failures', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    await expect(dispatcher.execute(job('DiscordRolesSync'))).resolves.toMatchObject({
      success: false,
      stats: { total: 5, inserted: 3, updated: 2, errors: 1, skipped: 2 }
    })
    await expect(dispatcher.execute(job('RenewalAcSync'))).resolves.toMatchObject({
      success: false,
      stats: { total: 5, inserted: 3, updated: 2, errors: 1, skipped: 2 }
    })
    await expect(dispatcher.execute(job('AchievementEvaluation'))).resolves.toMatchObject({
      success: false,
      stats: { total: 5, inserted: 0, updated: 4, errors: 1, skipped: 1 }
    })
  })

  it('redacts Discord runner failures to a stable public message', async () => {
    const dependencies = createDependencies()
    dependencies.runDiscordRolesSync.mockRejectedValueOnce(new Error('discord-user-id-secret'))
    const dispatcher = new CronJobDispatcher(dependencies)

    await expect(dispatcher.execute(job('DiscordRolesSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução Discord falhou',
    })
  })

  it('passes dry-run and phase options to Renewal AC and returns only its bounded plan fields', async () => {
    const dependencies = createDependencies()
    dependencies.runRenewalAcSync.mockResolvedValueOnce({
      expired: 0,
      refundDetection: null,
      plan: {
        operation: 'renewal-ac-sync',
        dryRun: true,
        batchId: 'internal-plan-id',
        windowHours: 26,
        classChangesSeen: 3,
        anomalyAborted: false,
        planned: 2,
        blocked: 1,
        skippedDuplicates: 0,
        refundReverts: 0,
        overCap: false,
        limit: 20_000,
        truncated: true,
        remaining: 1,
      },
      execution: null,
    })
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    await expect(dispatcher.execute(job('RenewalAcSync'), { dryRun: true, phaseHooks })).resolves.toEqual({
      success: true,
      stats: { total: 3, inserted: 2, updated: 0, errors: 0, skipped: 1 },
      dryRun: true,
      plan: {
        operation: 'renewal-ac-sync',
        dryRun: true,
        windowHours: 26,
        classChangesSeen: 3,
        anomalyAborted: false,
        planned: 2,
        blocked: 1,
        skippedDuplicates: 0,
        refundReverts: 0,
        overCap: false,
        limit: 20_000,
        truncated: true,
        remaining: 1,
      },
    })
    expect(dependencies.runRenewalAcSync).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('sanitizes Renewal AC anomaly details in the public dispatch contract', async () => {
    const dependencies = createDependencies()
    dependencies.runRenewalAcSync.mockResolvedValueOnce({
      plan: {
        operation: 'renewal-ac-sync',
        anomalyAborted: true,
        anomalyDetail: 'internal count=999 threshold=20',
        classChangesSeen: 999,
        planned: 0,
        blocked: 0,
        skippedDuplicates: 0,
        refundReverts: 0,
        limit: 20_000,
        truncated: false,
        remaining: 0,
      },
      execution: null,
    })

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalAcSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Plano Renewal AC abortado por anomalia',
    })
  })

  it('sanitizes Renewal AC runner failures while retaining internal logging only', async () => {
    const dependencies = createDependencies()
    dependencies.runRenewalAcSync.mockRejectedValueOnce(new Error('internal provider token and database details'))

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalAcSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução Renewal AC falhou',
    })
  })

  it.each([
    ['hotmart', 'fetchHotmart'],
    ['curseduca', 'fetchCurseduca']
  ] as const)('uses the %s adapter and exact Universal Sync envelope', async (syncType, fetchDependency) => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)

    await dispatcher.execute(job('StandardSync', syncType))

    expect(dependencies[fetchDependency]).toHaveBeenCalledTimes(1)
    expect(dependencies.executeUniversalSync).toHaveBeenCalledWith({
      syncType,
      jobName: 'StandardSync',
      jobId: 'job-id',
      triggeredBy: 'CRON',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: []
    } satisfies UniversalSyncRequest)
  })


})
