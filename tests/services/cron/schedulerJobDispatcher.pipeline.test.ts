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
  it('reports Discord as an explicit skipped no-op', async () => {
    const dispatcher = new CronJobDispatcher(createDependencies())

    await expect(dispatcher.execute(job('StandardDiscord', 'discord'))).resolves.toEqual({
      success: true,
      stats: { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 1 },
      data: { status: 'skipped', reason: 'not-configured' },
    })
  })

  it('fails closed when an all-sync child preflight rejects', async () => {
    const dependencies = createDependencies()
    dependencies.executeUniversalSync
      .mockResolvedValueOnce({
        success: true,
        dryRun: true,
        stats: { ...emptyStats },
        plan: {
          operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false,
          limit: 20_000, total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0, remaining: 0,
          projectedMutations: 1,
        },
      })
      .mockRejectedValueOnce(new Error('curseduca failed'))
    const dispatcher = new CronJobDispatcher(dependencies)

    await expect(dispatcher.execute(job('AllSync', 'all'))).resolves.toEqual({
      success: false,
      stats: { ...emptyStats, errors: 1 },
      errorMessage: 'Execução All sync falhou'
    })
    expect(dependencies.executeUniversalSync).toHaveBeenCalledTimes(2)
  })

  it('passes a bounded provider snapshot into the all-sync preflight', async () => {
    const dependencies = createDependencies()
    const sourceData = Array.from({ length: 201 }, (_value, index) => ({ email: `user-${index}@example.test` }))
    dependencies.fetchHotmart.mockResolvedValue(sourceData)
    const dispatcher = new CronJobDispatcher(dependencies)

    await dispatcher.execute(job('AllSync', 'all'))

    expect(dependencies.executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
      syncType: 'hotmart',
      sourceData,
    }))
    expect(dependencies.executeUniversalSync).toHaveBeenCalledTimes(2)
  })

  it('allows concurrent composed executions to enter the same pipeline runner', async () => {
    const dependencies = createDependencies()
    let started = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    dependencies.executeDailyPipeline.mockImplementation(async () => {
      started += 1
      if (started === 2) release()
      await gate
      return { success: true, summary: {}, errors: [] }
    })
    const dispatcher = new CronJobDispatcher(dependencies)

    const first = dispatcher.execute(job('Daily', 'pipeline'))
    const second = dispatcher.execute(job('Daily', 'pipeline'))
    await Promise.resolve()
    await Promise.resolve()

    expect(started).toBe(2)
    release()
    await Promise.all([first, second])
  })

  it('normalizes the daily pipeline result', async () => {
    const dispatcher = new CronJobDispatcher(createDependencies())

    await expect(dispatcher.execute(job('Daily', 'pipeline'))).resolves.toEqual({
      success: true,
      stats: { total: 7, inserted: 0, updated: 2, errors: 0, skipped: 0 },
      errorMessage: undefined
    })
  })

  it('passes dry-run and phase options only to the shared pipeline runner', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }
    dependencies.executeDailyPipeline.mockResolvedValueOnce({
      dryRun: true,
      success: true,
      summary: { totalUsers: 0, totalUserProducts: 0 },
      errors: [],
      plan: { operation: 'daily-pipeline', dryRun: true, withinLimit: true, limit: 20_000 },
    })

    await expect(dispatcher.execute(job('DryRun', 'pipeline'), { dryRun: true, phaseHooks })).resolves.toMatchObject({
      success: true,
      dryRun: true,
      plan: { operation: 'daily-pipeline' },
    })
    expect(dependencies.executeDailyPipeline).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('passes dry-run and phase options to achievement evaluation and reports zero writes', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }
    dependencies.evaluateAchievements.mockResolvedValueOnce({
      total: 3,
      processed: 3,
      evaluated: 3,
      errors: 0,
      dryRun: true,
      plan: {
        operation: 'achievement-evaluation',
        dryRun: true,
        matching: 3,
        evaluated: 3,
        wouldEvaluate: 3,
        limit: 20_000,
        truncated: false,
        remaining: 0,
      },
    })

    await expect(dispatcher.execute(job('AchievementEvaluation'), { dryRun: true, phaseHooks }))
      .resolves.toEqual({
        success: true,
        stats: { total: 3, inserted: 0, updated: 0, errors: 0, skipped: 0 },
        dryRun: true,
        plan: expect.objectContaining({ operation: 'achievement-evaluation', matching: 3 }),
      })
    expect(dependencies.evaluateAchievements).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('passes dry-run and phase options to the scheduled Discord messages runner', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    await dispatcher.execute(job('DiscordScheduledMessages', 'discord'), { dryRun: true, phaseHooks })

    expect(dependencies.runScheduledMessages).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('passes dry-run and phase options to cleanup and preserves its bounded plan', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }
    dependencies.cleanupExecutions.mockResolvedValueOnce({
      success: true,
      deleted: 0,
      remaining: 10_000,
      dryRun: true,
      plan: {
        operation: 'cron-execution-cleanup',
        dryRun: true,
        totalBefore: 30_000,
        eligible: 20_000,
        wouldDelete: 20_000,
        minimumToKeep: 100,
        limit: 20_000,
        truncated: true,
        remaining: 1,
      },
    })

    await expect(dispatcher.execute(job('CronExecutionCleanup'), { dryRun: true, phaseHooks }))
      .resolves.toMatchObject({
        success: true,
        dryRun: true,
        stats: { total: 20_000, inserted: 0, updated: 0, errors: 0, skipped: 20_000 },
        plan: { operation: 'cron-execution-cleanup', truncated: true },
      })
    expect(dependencies.cleanupExecutions).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
  })

  it('normalizes live cleanup stats from bounded candidates and deletes', async () => {
    const dependencies = createDependencies()
    const dispatcher = new CronJobDispatcher(dependencies)
    dependencies.cleanupExecutions.mockResolvedValueOnce({
      success: true,
      deleted: 50,
      remaining: 100,
      plan: {
        operation: 'cron-execution-cleanup',
        dryRun: true,
        totalBefore: 150,
        eligible: 75,
        wouldDelete: 50,
        minimumToKeep: 100,
        limit: 20_000,
        truncated: false,
        remaining: 0,
      },
    })

    await expect(dispatcher.execute(job('CronExecutionCleanup'))).resolves.toMatchObject({
      success: true,
      stats: { total: 75, inserted: 0, updated: 50, errors: 0, skipped: 25 },
    })
  })

  it('fails closed for an unsupported sync type', async () => {
    const dispatcher = new CronJobDispatcher(createDependencies())

    await expect(dispatcher.execute(job('Unknown', 'guru'))).rejects.toThrow('Tipo de sync desconhecido: guru')
  })

  it('normalizes non-Error runner rejections', async () => {
    const dependencies = createDependencies()
    dependencies.evaluateRules.mockRejectedValue('broken')
    const dispatcher = new CronJobDispatcher(dependencies)

    await expect(dispatcher.execute(job('EvaluateRules'))).resolves.toEqual({
      success: false,
      stats: { ...emptyStats, errors: 1 },
      errorMessage: 'broken'
    })
  })
})
