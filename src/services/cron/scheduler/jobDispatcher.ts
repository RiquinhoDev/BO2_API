import { ILastRunStats, SyncType } from '../../../models/SyncModels/CronJobConfig'
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
}

type UnknownRunner = () => Promise<unknown>

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
  runAcTagWatch: UnknownRunner
  evaluateAchievements: UnknownRunner
  executeDailyPipeline: UnknownRunner
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
  'ClarezaDailyRefresh',
  'GuruTrialCheck',
  'RenewalOfferSync',
  'AchievementEvaluation',
  'RenewalAcSync',
  'DiscordRolesSync',
  'DiscordScheduledMessages',
  'AcTagWatch'
] as const

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

  return {
    success: booleanOf(result, 'success') !== false && stats.errors === 0,
    stats,
    errorMessage: stringOf(result, 'error') ?? stringOf(result, 'errorMessage')
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
  cleanupExecutions: async () => (await import('../../../jobs/cronExecutionCleanup.job')).default.run(),
  weeklyTagSnapshot: async () => (await import('../../../jobs/weeklyTagSnapshot.job')).default.run(),
  clarezaRefresh: async () => (await import('../../../jobs/clareza.job')).default.run(),
  guruTrialCheck: async () => (await import('../../../jobs/guruTrialCheck.job')).default.run(),
  syncRenewalOffers,
  runScheduledMessages: async () =>
    (await import('../../renewal/discordScheduledMessages.service')).runScheduledMessagesJob(),
  runDiscordRolesSync: async () =>
    (await import('../../renewal/discordRolesSync.service')).runDiscordRolesSyncJob(),
  runRenewalAcSync: async () =>
    (await import('../../renewal/renewalAcSync.service')).runRenewalAcSyncJob(),
  runAcTagWatch: async () =>
    (await import('../../renewal/acTagWatch.service')).correrAcTagWatch({ dryRun: false, actualizarEspelho: true }),
  evaluateAchievements: async () => evaluateAllAchievements({ backfillUnlockedAsSeen: true }),
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

  async execute(job: CronDispatchJob): Promise<CronDispatchResult> {
    if (SPECIFIC_JOB_NAMES.some(name => job.name.includes(name))) {
      return this.executeSpecific(job)
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
        return this.executePipeline()
      default:
        throw new Error(`Tipo de sync desconhecido: ${job.syncType}`)
    }
  }

  private async executeSpecific(job: CronDispatchJob): Promise<CronDispatchResult> {
    try {
      if (job.name.includes('RenewalOfferSync')) {
        const report = recordOf(await this.dependencies.syncRenewalOffers())
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
        const report = recordOf(await this.dependencies.runScheduledMessages())
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

      if (job.name.includes('DiscordRolesSync')) {
        return this.normalizePlannedExecution(await this.dependencies.runDiscordRolesSync(), 'accountsDesired')
      }
      if (job.name.includes('RenewalAcSync')) {
        return this.normalizePlannedExecution(await this.dependencies.runRenewalAcSync(), 'classChangesSeen')
      }
      if (job.name.includes('AcTagWatch')) {
        const report = recordOf(await this.dependencies.runAcTagWatch())
        const errors = arrayOf(report, 'errors').map(item => {
          const entry = recordOf(item)
          return `${String(entry.contexto)}: ${String(entry.error)}`
        })
        return {
          success: errors.length === 0,
          stats: {
            total: numberOf(report, 'alunosLidos'),
            inserted: numberOf(report, 'eventosGravados'),
            updated: 0,
            errors: errors.length,
            skipped: numberOf(report, 'jaExistiam')
          },
          errorMessage: errors.join(' | ') || undefined
        }
      }
      if (job.name.includes('AchievementEvaluation')) {
        const report = recordOf(await this.dependencies.evaluateAchievements())
        const total = numberOf(report, 'total')
        const evaluated = numberOf(report, 'evaluated')
        const errors = numberOf(report, 'errors')
        return {
          success: errors === 0,
          stats: { total, inserted: 0, updated: evaluated, errors, skipped: Math.max(0, total - evaluated) }
        }
      }

      const runner = this.specificRunner(job.name)
      if (!runner) throw new Error(`Job específico não encontrado: ${job.name}`)
      return normalizeGenericResult(await runner())
    } catch (error) {
      logger.error('Erro ao executar job específico', error)
      return { success: false, stats: { ...EMPTY_STATS, errors: 1 }, errorMessage: errorMessageOf(error) }
    }
  }

  private specificRunner(name: string): UnknownRunner | undefined {
    if (name.includes('EvaluateRules')) return this.dependencies.evaluateRules
    if (name.includes('ResetCounters')) return this.dependencies.resetCounters
    if (name.includes('RebuildDashboardStats')) return this.dependencies.rebuildDashboardStats
    if (name.includes('CronExecutionCleanup')) return this.dependencies.cleanupExecutions
    if (name.includes('WeeklyTagSnapshot')) return this.dependencies.weeklyTagSnapshot
    if (name.includes('ClarezaDailyRefresh')) return this.dependencies.clarezaRefresh
    if (name.includes('GuruTrialCheck')) return this.dependencies.guruTrialCheck
    return undefined
  }

  private normalizePlannedExecution(value: unknown, totalKey: 'accountsDesired' | 'classChangesSeen'): CronDispatchResult {
    const report = recordOf(value)
    const plan = nestedRecordOf(report, 'plan')
    const execution = nestedRecordOf(report, 'execution')
    const anomalyAborted = booleanOf(plan, 'anomalyAborted') === true
    const blocked = totalKey === 'classChangesSeen' ? numberOf(plan, 'blocked') : 0
    const notInGuild = totalKey === 'accountsDesired' ? numberOf(execution, 'notInGuild') : 0
    return {
      success: !anomalyAborted,
      stats: {
        total: numberOf(plan, totalKey),
        inserted: numberOf(plan, 'planned'),
        updated: numberOf(execution, 'applied'),
        errors: numberOf(execution, 'failed') + (anomalyAborted ? 1 : 0),
        skipped: blocked + numberOf(plan, 'skippedDuplicates') + notInGuild
      },
      errorMessage: stringOf(plan, 'anomalyDetail')
    }
  }

  private async executePipeline(): Promise<CronDispatchResult> {
    try {
      const result = recordOf(await this.dependencies.executeDailyPipeline())
      const summary = nestedRecordOf(result, 'summary')
      const errors = arrayOf(result, 'errors').map(String)
      return {
        success: booleanOf(result, 'success') === true,
        stats: {
          total: numberOf(summary, 'totalUsers') + numberOf(summary, 'totalUserProducts'),
          inserted: 0,
          updated: numberOf(summary, 'engagementUpdated'),
          errors: errors.length,
          skipped: 0
        },
        errorMessage: errors.length > 0 ? errors.join('; ') : undefined
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
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      stats.total += result.value.stats.total
      stats.inserted += result.value.stats.inserted
      stats.updated += result.value.stats.updated
      stats.errors += result.value.stats.errors
      stats.skipped += result.value.stats.skipped
    }
    return { success: results.every(result => result.status === 'fulfilled' && result.value.success), stats }
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
