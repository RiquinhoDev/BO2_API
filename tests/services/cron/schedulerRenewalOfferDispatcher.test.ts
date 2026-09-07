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
  evaluateRules: jest.fn(async () => ({})),
  resetCounters: jest.fn(async () => ({})),
  rebuildDashboardStats: jest.fn(async () => ({})),
  cleanupExecutions: jest.fn(async () => ({})),
  weeklyTagSnapshot: jest.fn(async () => ({})),
  clarezaRefresh: jest.fn(async () => ({})),
  guruTrialCheck: jest.fn(async () => ({})),
  syncRenewalOffers: jest.fn(async () => ({ upserted: 2, deactivated: 1, unknownNames: ['x'] })),
  runScheduledMessages: jest.fn(async () => ({})),
  runDiscordRolesSync: jest.fn(async () => ({})),
  runRenewalAcSync: jest.fn(async () => ({})),
  evaluateAchievements: jest.fn(async () => ({})),
  executeDailyPipeline: jest.fn(async () => ({})),
  fetchHotmart: jest.fn(async () => []),
  fetchCurseduca: jest.fn(async () => []),
  executeUniversalSync: jest.fn<Promise<unknown>, [UniversalSyncRequest]>(async () => ({
    success: true,
    stats: { ...emptyStats, total: 10 }
  }))
})

describe('CronJobDispatcher RenewalOfferSync', () => {
  it('forwards manual options and sanitizes the bounded public plan', async () => {
    const dependencies = createDependencies()
    dependencies.syncRenewalOffers.mockResolvedValueOnce({
      success: true,
      total: 5,
      inserted: 0,
      updated: 4,
      skipped: 0,
      upserted: 4,
      deactivated: 1,
      errors: 0,
      dryRun: true,
      plan: {
        operation: 'renewal-offer-sync',
        dryRun: true,
        create: 2,
        update: 1,
        reactivate: 1,
        deactivate: 1,
        unchanged: 3,
        totalOperations: 5,
        limit: 20_000,
        truncated: false,
        remaining: 0,
        anomaly: false,
        email: 'private@example.test',
        offerCode: 'private-offer-code',
      },
    })
    const phaseHooks = {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'), {
      dryRun: true,
      phaseHooks,
      triggeredBy: 'MANUAL',
    })).resolves.toEqual({
      success: true,
      stats: { total: 5, inserted: 0, updated: 4, errors: 0, skipped: 0 },
      dryRun: true,
      errorMessage: undefined,
      plan: {
        operation: 'renewal-offer-sync',
        dryRun: true,
        truncated: false,
        anomaly: false,
        create: 2,
        update: 1,
        reactivate: 1,
        deactivate: 1,
        unchanged: 3,
        totalOperations: 5,
        limit: 20_000,
        remaining: 0,
      },
    })
    expect(dependencies.syncRenewalOffers).toHaveBeenCalledWith({ dryRun: true, phaseHooks, triggeredBy: 'MANUAL' })
  })

  it('does not dispatch a name containing RenewalOfferSync as an alias', async () => {
    const dependencies = createDependencies()

    await new CronJobDispatcher(dependencies).execute(job('BackupRenewalOfferSync'))

    expect(dependencies.syncRenewalOffers).not.toHaveBeenCalled()
    expect(dependencies.fetchHotmart).toHaveBeenCalledTimes(1)
  })

  it('redacts thrown and malformed RenewalOfferSync details', async () => {
    const dependencies = createDependencies()
    dependencies.syncRenewalOffers.mockRejectedValueOnce(new Error('provider-token-and-email'))

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })

    dependencies.syncRenewalOffers.mockResolvedValueOnce({
      success: true,
      dryRun: true,
      plan: {
        operation: 'renewal-offer-sync',
        dryRun: true,
        create: 1,
        update: 0,
        reactivate: 0,
        deactivate: 0,
        unchanged: 0,
        totalOperations: 999,
        limit: 20_000,
        truncated: false,
        remaining: 0,
      },
    })
    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })

    dependencies.syncRenewalOffers.mockResolvedValueOnce({ success: true, dryRun: true })
    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })
  })

  it('does not treat an absent or over-cap live envelope as success', async () => {
    const dependencies = createDependencies()
    dependencies.syncRenewalOffers.mockResolvedValueOnce({})

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })

    dependencies.syncRenewalOffers.mockResolvedValueOnce({
      success: true,
      total: 20_001,
      inserted: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
      upserted: 20_001,
      deactivated: 0,
      unknownNames: [],
    })
    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })
  })

  it('rejects anomalous or over-cap preview state instead of settling success', async () => {
    const dependencies = createDependencies()
    dependencies.syncRenewalOffers.mockResolvedValueOnce({
      success: true,
      total: 1,
      inserted: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
      dryRun: true,
      plan: {
        operation: 'renewal-offer-sync',
        dryRun: true,
        create: 0,
        update: 0,
        reactivate: 0,
        deactivate: 0,
        unchanged: 99_999,
        totalOperations: 0,
        limit: 20_000,
        remaining: 0,
        truncated: false,
        anomaly: true,
      },
    })

    await expect(new CronJobDispatcher(dependencies).execute(job('RenewalOfferSync'))).resolves.toMatchObject({
      success: false,
      errorMessage: 'Execução RenewalOfferSync falhou',
    })
  })
})
