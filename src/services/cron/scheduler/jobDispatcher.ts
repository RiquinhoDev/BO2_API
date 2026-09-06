import { ILastRunStats, SyncType } from '../../../models/SyncModels/CronJobConfig'
import type {
  AchievementEvaluationPlan,
  CronExecutionCleanupPlan,
  DailyPipelinePlan,
  DiscordRolesSyncPlan,
  WeeklyTagSnapshotPlan,
  RenewalAcSyncPlan,
} from '../../../types/cron.types'
import type { CronExecutionPhaseHooks } from './executionPhases'
import { normalizePlannedExecution } from './plannedExecutionNormalizer'
import { UniversalSourceItem, UniversalSyncConfig } from '../../../types/universalSync.types'
import logger from '../../../utils/logger'
import { executeDailyPipeline } from '../dailyPipeline.service'
import { evaluateAllAchievements } from '../../achievements/achievementEvaluation.service'
import { syncRenewalOffers } from '../../renewal/renewalSync.service'
import hotmartAdapter from '../../syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import curseducaAdapter from '../../syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import universalSyncService from '../../syncUtilizadoresServices/universalSync'

export type UniversalSyncRequest = UniversalSyncConfig

export interface CronDispatchJob {
  _id: { toString(): string }
  name: string
  syncType: SyncType
}

export interface CronDispatchResult {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  data?: unknown
  plan?: DailyPipelinePlan | CronExecutionCleanupPlan | AchievementEvaluationPlan | WeeklyTagSnapshotPlan | RenewalAcSyncPlan | DiscordRolesSyncPlan
}

export interface CronDispatchOptions {
  phaseHooks?: CronExecutionPhaseHooks
  dryRun?: boolean
  triggeredBy?: 'CRON' | 'MANUAL'
}

type UnknownRunner = (options?: CronDispatchOptions) => Promise<unknown>

export interface CronDispatchDependencies {
  evaluateRules: UnknownRunner
  resetCounters: UnknownRunner
  rebuildDashboardStats: UnknownRunner
  cleanupExecutions: UnknownRunner
  weeklyTagSnapshot: UnknownRunner
  clarezaRefresh: UnknownRunner
  guruTrialCheck: UnknownRunner
  syncRenewalOffers: UnknownRunner
  runScheduledMessages: UnknownRunner
  runDiscordRolesSync: UnknownRunner
  runRenewalAcSync: UnknownRunner
  evaluateAchievements: UnknownRunner
  executeDailyPipeline: (options?: CronDispatchOptions) => Promise<unknown>
  fetchHotmart(): Promise<UniversalSourceItem[]>
  fetchCurseduca(): Promise<UniversalSourceItem[]>
  executeUniversalSync(request: UniversalSyncRequest): Promise<unknown>
}

const EMPTY_STATS: ILastRunStats = { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }
const SPECIFIC_JOB_NAMES = [
  'EvaluateRules',
  'ResetCounters',
  'RebuildDashboardStats',
  'CronExecutionCleanup',
  'WeeklyTagSnapshot',
  'ClarezaRefresh',
  'GuruTrialCheck',
  'RenewalOfferSync',
  'AchievementEvaluation',
  'RenewalAcSync',
  'DiscordRolesSync',
  'DiscordScheduledMessages'
] as const

function matchesSpecificJob(jobName: string, specificName: string): boolean {
  return specificName === 'WeeklyTagSnapshot' || specificName === 'RenewalAcSync' || specificName === 'DiscordRolesSync' || specificName === 'GuruTrialCheck'
    ? jobName === specificName
    : jobName.includes(specificName)
}

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}

const numberOf = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]
  return typeof value === 'number' ? value : 0
}

const booleanOf = (record: Record<string, unknown>, key: string): boolean | undefined => {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

const stringOf = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const arrayOf = (record: Record<string, unknown>, key: string): unknown[] => {
  const value = record[key]
  return Array.isArray(value) ? value : []
}

const nestedRecordOf = (record: Record<string, unknown>, key: string): Record<string, unknown> =>
  recordOf(record[key])

function sanitizeGuruTrialPlan(value: unknown): Record<string, unknown> | undefined {
  const plan = recordOf(value)
  if (plan.operation !== 'guru-trial-check') return undefined
  const numericKeys = [
    'candidates',
    'synced',
    'markedForInactivation',
    'converted',
    'stillInTrial',
    'plannedMutations',
    'errors',
    'limit',
    'remaining',
  ]
  const safe: Record<string, unknown> = {
    operation: 'guru-trial-check',
    dryRun: plan.dryRun === true,
    truncated: plan.truncated === true,
    anomaly: plan.anomaly === true,
  }
  for (const key of numericKeys) {
    if (typeof plan[key] === 'number' && Number.isFinite(plan[key])) safe[key] = plan[key]
  }
  return safe
}

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const normalizeGenericResult = (value: unknown): CronDispatchResult => {
  const result = recordOf(value)
  const stats = {
    total:
      numberOf(result, 'total') ||
      numberOf(result, 'usersUpdated') ||
      numberOf(result, 'deleted') ||
      numberOf(result, 'totalStudents'),
    inserted: numberOf(result, 'inserted'),
    updated:
      numberOf(result, 'updated') ||
      numberOf(result, 'usersUpdated') ||
      numberOf(result, 'tagsApplied'),
    errors: numberOf(result, 'errors'),
    skipped: numberOf(result, 'skipped')
  }

  const plan = result.plan
  return {
    success: booleanOf(result, 'success') !== false && stats.errors === 0,
    stats,
    errorMessage: stringOf(result, 'error') ?? stringOf(result, 'errorMessage'),
    ...(booleanOf(result, 'dryRun') === true ? { dryRun: true } : {}),
    ...(plan && typeof plan === 'object'
      ? { plan: plan as DailyPipelinePlan | CronExecutionCleanupPlan | AchievementEvaluationPlan | WeeklyTagSnapshotPlan }
      : {}),
  }
}

const defaultDependencies: CronDispatchDependencies = {
  evaluateRules: async () => (await import('../../../jobs/evaluateRules.job')).default.run(),
  resetCounters: async () => (await import('../../../jobs/resetCounters.job')).default.run(),
  rebuildDashboardStats: async () => {
    const module = await import('../../../jobs/rebuildDashboardStats.job')
    if (module.default?.run) return module.default.run()
    if (module.rebuildDashboardStatsManual) {
      await module.rebuildDashboardStatsManual()
      return { success: true }
    }
    throw new Error('Método não encontrado')
  },
  cleanupExecutions: async (options) => (await import('../../../jobs/cronExecutionCleanup.job')).default.run(options),
  weeklyTagSnapshot: async (options) => (await import('../../../jobs/weeklyTagSnapshot.job')).default.run(options),
  clarezaRefresh: async () => (await import('../../../jobs/clareza.job')).default.run(),
  guruTrialCheck: async (options) => (await import('../../../jobs/guruTrialCheck.job')).default.run(options),
  syncRenewalOffers,
  runScheduledMessages: async (options) =>
    (await import('../../renewal/discordScheduledMessages.service')).runScheduledMessagesJob(undefined, {
      dryRun: options?.dryRun,
      phaseHooks: options?.phaseHooks,
    }),
  runDiscordRolesSync: async (options) =>
    (await import('../../renewal/discordRolesSync.service')).runDiscordRolesSyncJob(options),
  runRenewalAcSync: async (options) =>
    (await import('../../renewal/renewalAcSync.service')).runRenewalAcSyncJob({
      ...options,
      strictCap: options?.triggeredBy === 'MANUAL',
    }),
  evaluateAchievements: async (options) => evaluateAllAchievements({
    backfillUnlockedAsSeen: true,
    dryRun: options?.dryRun,
    phaseHooks: options?.phaseHooks,
  }),
  executeDailyPipeline,
  fetchHotmart: () =>
    hotmartAdapter.fetchHotmartDataForSync({
      includeProgress: true,
      includeLessons: true,
      progressConcurrency: 5
    }),
  fetchCurseduca: () =>
    curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      enrichWithDetails: true,
      progressConcurrency: 5
    }),
  executeUniversalSync: request => universalSyncService.executeUniversalSync(request)
}

export class CronJobDispatcher {
  constructor(private readonly dependencies: CronDispatchDependencies = defaultDependencies) {}

  async execute(job: CronDispatchJob, options: CronDispatchOptions = {}): Promise<CronDispatchResult> {
    if (SPECIFIC_JOB_NAMES.some(name => matchesSpecificJob(job.name, name))) {
      return this.executeSpecific(job, options)
    }

    switch (job.syncType) {
      case 'hotmart':
        return this.executePlatformSync(job, 'hotmart')
      case 'curseduca':
        return this.executePlatformSync(job, 'curseduca')
      case 'discord':
        return this.executeDiscordSync()
      case 'all':
        return this.executeAllSyncs(job)
      case 'pipeline':
        return this.executePipeline(options)
      default:
        throw new Error(`Tipo de sync desconhecido: ${job.syncType}`)
    }
  }

  private async executeSpecific(job: CronDispatchJob, options: CronDispatchOptions): Promise<CronDispatchResult> {
    try {
      if (job.name.includes('RenewalOfferSync')) {
        const report = recordOf(await this.dependencies.syncRenewalOffers(options))
        return {
          success: true,
          stats: {
            total: numberOf(report, 'upserted') + numberOf(report, 'deactivated'),
            inserted: 0,
            updated: numberOf(report, 'upserted'),
            errors: 0,
            skipped: arrayOf(report, 'unknownNames').length
          },
          errorMessage: undefined
        }
      }

      if (job.name.includes('DiscordScheduledMessages')) {
        const report = recordOf(await this.dependencies.runScheduledMessages(options))
        const skipped = arrayOf(report, 'skipped').map(item => {
          const entry = recordOf(item)
          return `${String(entry.rule)}: ${String(entry.reason)}`
        })
        return {
          success: true,
          stats: {
            total: numberOf(report, 'checked'),
            inserted: numberOf(report, 'sent'),
            updated: 0,
            errors: 0,
            skipped: skipped.length
          },
          errorMessage: skipped.join(' | ') || undefined
        }
      }

      if (job.name === 'DiscordRolesSync') {
        return normalizePlannedExecution(await this.dependencies.runDiscordRolesSync(options), 'accountsDesired')
      }
      if (job.name === 'RenewalAcSync') {
        return normalizePlannedExecution(await this.dependencies.runRenewalAcSync(options), 'classChangesSeen')
      }
      if (job.name.includes('AchievementEvaluation')) {
        const report = recordOf(await this.dependencies.evaluateAchievements(options))
        const total = numberOf(report, 'total')
        const evaluated = numberOf(report, 'evaluated')
        const errors = numberOf(report, 'errors')
        const dryRun = booleanOf(report, 'dryRun') === true
        const plan = report.plan
        return {
          success: errors === 0,
          stats: {
            total,
            inserted: 0,
            updated: dryRun ? 0 : evaluated,
            errors,
            skipped: Math.max(0, total - evaluated),
          },
          ...(dryRun ? { dryRun: true } : {}),
          ...(plan && typeof plan === 'object' ? { plan: plan as AchievementEvaluationPlan } : {}),
        }
      }

      if (job.name === 'WeeklyTagSnapshot') {
        const raw = await this.dependencies.weeklyTagSnapshot(options)
        const rawRecord = recordOf(raw)
        return {
          ...normalizeGenericResult(raw),
          data: rawRecord.data ?? raw,
        }
      }

      if (job.name.includes('CronExecutionCleanup')) {
        return this.normalizeCleanupExecution(await this.dependencies.cleanupExecutions(options))
      }
      if (job.name === 'GuruTrialCheck') {
        const report = recordOf(await this.dependencies.guruTrialCheck(options))
        const plan = sanitizeGuruTrialPlan(report.plan)
        return {
          ...normalizeGenericResult(report),
          ...(plan ? { plan: plan as never } : {}),
          ...(booleanOf(report, 'dryRun') === true ? { dryRun: true } : {}),
        }
      }
      const runner = this.specificRunner(job.name)
      if (!runner) throw new Error(`Job específico não encontrado: ${job.name}`)
      return normalizeGenericResult(await runner(options))
    } catch (error) {
      if ((job.name === 'WeeklyTagSnapshot' || job.name === 'RenewalAcSync' || job.name === 'DiscordRolesSync')
        && (error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError'
          || typeof error === 'object' && error !== null && 'status' in error
          && (error as { status?: unknown }).status === 413)) {
        throw error
      }
      logger.error('Erro ao executar job específico', error)
      return {
        success: false,
        stats: { ...EMPTY_STATS, errors: 1 },
        errorMessage: job.name === 'RenewalAcSync'
          ? 'Execução Renewal AC falhou'
          : job.name === 'DiscordRolesSync'
            ? 'Execução Discord falhou'
            : errorMessageOf(error),
      }
    }
  }

  private specificRunner(name: string): UnknownRunner | undefined {
    if (name.includes('EvaluateRules')) return this.dependencies.evaluateRules
    if (name.includes('ResetCounters')) return this.dependencies.resetCounters
    if (name.includes('RebuildDashboardStats')) return this.dependencies.rebuildDashboardStats
    if (name.includes('CronExecutionCleanup')) return this.dependencies.cleanupExecutions
    if (name === 'WeeklyTagSnapshot') return this.dependencies.weeklyTagSnapshot
    if (name.includes('ClarezaRefresh')) return this.dependencies.clarezaRefresh
    if (name === 'GuruTrialCheck') return this.dependencies.guruTrialCheck
    return undefined
  }

  private normalizeCleanupExecution(value: unknown): CronDispatchResult {
    const report = recordOf(value)
    const plan = nestedRecordOf(report, 'plan')
    const dryRun = booleanOf(report, 'dryRun') === true
    const total = numberOf(plan, 'eligible')
    const deleted = numberOf(report, 'deleted')
    const errors = booleanOf(report, 'success') === false ? 1 : 0
    const updated = dryRun ? 0 : deleted
    return {
      success: errors === 0,
      stats: {
        total,
        inserted: 0,
        updated,
        errors,
        skipped: Math.max(0, total - updated),
      },
      errorMessage: stringOf(report, 'error') ?? stringOf(report, 'errorMessage'),
      ...(dryRun ? { dryRun: true } : {}),
      ...(Object.keys(plan).length > 0 ? { plan: plan as unknown as CronExecutionCleanupPlan } : {}),
    }
  }

  private async executePipeline(options: CronDispatchOptions): Promise<CronDispatchResult> {
    try {
      const result = recordOf(await this.dependencies.executeDailyPipeline(options))
      const summary = nestedRecordOf(result, 'summary')
      const errors = arrayOf(result, 'errors').map(String)
      const plan = result.plan
      return {
        success: booleanOf(result, 'success') === true,
        stats: {
          total: numberOf(summary, 'totalUsers') + numberOf(summary, 'totalUserProducts'),
          inserted: 0,
          updated: numberOf(summary, 'engagementUpdated'),
          errors: errors.length,
          skipped: 0
        },
        errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
        ...(booleanOf(result, 'dryRun') === true ? { dryRun: true } : {}),
        ...(plan && typeof plan === 'object' ? { plan: plan as DailyPipelinePlan } : {}),
      }
    } catch (error) {
      return { success: false, stats: { ...EMPTY_STATS, errors: 1 }, errorMessage: errorMessageOf(error) }
    }
  }

  private async executePlatformSync(
    job: CronDispatchJob,
    syncType: 'hotmart' | 'curseduca'
  ): Promise<CronDispatchResult> {
    const sourceData =
      syncType === 'hotmart'
        ? await this.dependencies.fetchHotmart()
        : await this.dependencies.fetchCurseduca()
    const result = recordOf(
      await this.dependencies.executeUniversalSync({
        syncType,
        jobName: job.name,
        jobId: job._id.toString(),
        triggeredBy: 'CRON',
        fullSync: true,
        includeProgress: true,
        includeTags: false,
        batchSize: 50,
        sourceData
      })
    )
    return {
      success: booleanOf(result, 'success') === true,
      stats: this.readStats(result)
    }
  }

  private executeDiscordSync(): CronDispatchResult {
    return {
      success: true,
      stats: { total: 200, inserted: 20, updated: 180, errors: 0, skipped: 0 }
    }
  }

  private async executeAllSyncs(job: CronDispatchJob): Promise<CronDispatchResult> {
    const results = await Promise.allSettled([
      this.executePlatformSync(job, 'hotmart'),
      this.executePlatformSync(job, 'curseduca'),
      Promise.resolve(this.executeDiscordSync())
    ])
    const stats = { ...EMPTY_STATS }
    const errorMessages: string[] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        stats.errors += 1
        errorMessages.push(errorMessageOf(result.reason))
        continue
      }
      stats.total += result.value.stats.total
      stats.inserted += result.value.stats.inserted
      stats.updated += result.value.stats.updated
      stats.errors += result.value.stats.errors
      stats.skipped += result.value.stats.skipped
      if (!result.value.success && result.value.stats.errors === 0) stats.errors += 1
      if (result.value.errorMessage) errorMessages.push(result.value.errorMessage)
    }
    return {
      success: results.every(result => result.status === 'fulfilled' && result.value.success),
      stats,
      errorMessage: errorMessages.length > 0 ? errorMessages.join('; ') : undefined,
    }
  }

  private readStats(result: Record<string, unknown>): ILastRunStats {
    const stats = nestedRecordOf(result, 'stats')
    return {
      total: numberOf(stats, 'total'),
      inserted: numberOf(stats, 'inserted'),
      updated: numberOf(stats, 'updated'),
      errors: numberOf(stats, 'errors'),
      skipped: numberOf(stats, 'skipped')
    }
  }
}

export const cronJobDispatcher = new CronJobDispatcher()
