import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import type { UniversalSourceItem, UniversalSyncConfig } from '../../../types/universalSync.types'
import type { AllSyncPlan } from '../../../types/cron.types'
import type { CronExecutionPhaseHooks } from './executionPhases'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'
import { normalizeHotmartSyncDispatch } from './hotmartSyncDispatchNormalizer'
import { normalizeCurseducaSyncDispatch } from './curseducaSyncDispatchNormalizer'

export const ALL_SYNC_SOURCE_LIMIT = MAX_PROVIDER_READ_ITEMS
export const ALL_SYNC_EFFECTIVE_MUTATION_LIMIT = MAX_PROVIDER_READ_ITEMS

const EMPTY_STATS: ILastRunStats = { total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 }
const FAILURE = 'Execução All sync falhou'
const DISCORD_NOOP = { status: 'skipped' as const, reason: 'not-configured' as const }

export interface AllSyncJob {
  _id: { toString(): string }
  name: string
  syncType: string
}

export interface AllSyncOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
  triggeredBy?: 'CRON' | 'MANUAL'
}

export interface AllSyncDependencies {
  fetchHotmart(options?: AllSyncOptions): Promise<UniversalSourceItem[]>
  fetchCurseduca(options?: AllSyncOptions): Promise<UniversalSourceItem[]>
  executeUniversalSync(request: UniversalSyncConfig): Promise<unknown>
}

interface ChildResult {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: Record<string, unknown>
}

const recordOf = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
)

const safeInt = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
)

const requestedTrigger = (options: AllSyncOptions): 'CRON' | 'MANUAL' => options.triggeredBy ?? 'CRON'

// A dry-run prepares a child plan only. It must retain the lease assertion but
// cannot advance the composite receipt's provider/local phases. Live children
// receive the real hooks below, one after the other, so one receipt never has
// two concurrent mutation transitions.
const preflightHooks = (hooks?: CronExecutionPhaseHooks): CronExecutionPhaseHooks | undefined => (
  hooks
    ? {
      assertOwnership: hooks.assertOwnership,
      providerStarted: () => undefined,
      providerSucceeded: () => undefined,
      localMutationStarted: () => undefined,
      consumeMutation: () => undefined,
    }
    : undefined
)

const childRequest = (
  job: AllSyncJob,
  syncType: 'hotmart' | 'curseduca',
  sourceData: UniversalSourceItem[],
  options: AllSyncOptions,
  dryRun: boolean,
): UniversalSyncConfig => ({
  syncType,
  jobName: job.name,
  jobId: job._id.toString(),
  triggeredBy: requestedTrigger(options),
  dryRun,
  ...(options.phaseHooks ? { phaseHooks: options.phaseHooks } : {}),
  fullSync: true,
  includeProgress: true,
  includeTags: false,
  batchSize: 50,
  sourceData,
})

const normaliseChild = (
  syncType: 'hotmart' | 'curseduca',
  value: unknown,
  requestedDryRun: boolean,
): ChildResult => {
  const result = syncType === 'hotmart'
    ? normalizeHotmartSyncDispatch(value, { requestedDryRun })
    : normalizeCurseducaSyncDispatch(value, { requestedDryRun })
  return result as ChildResult
}

const normalisePreflight = (
  syncType: 'hotmart' | 'curseduca',
  settled: PromiseSettledResult<unknown>,
): ChildResult => {
  if (settled.status === 'rejected') {
    if (isOwnershipError(settled.reason)) throw settled.reason
    return failedChild()
  }
  return normaliseChild(syncType, settled.value, true)
}

const projectedMutations = (value: unknown): number | undefined => {
  const result = recordOf(value)
  const plan = recordOf(result.plan)
  for (const key of ['projectedMutations', 'projectedEffects', 'effectiveMutations', 'totalMutations']) {
    if (safeInt(plan[key])) return plan[key]
  }
  return undefined
}

const childPlan = (value: ChildResult, projected: number): Record<string, unknown> => {
  const plan = recordOf(value.plan)
  return {
    operation: plan.operation,
    dryRun: true,
    limit: plan.limit,
    total: plan.total,
    inserted: plan.inserted,
    updated: plan.updated,
    errors: plan.errors,
    skipped: plan.skipped,
    remaining: plan.remaining,
    truncated: plan.truncated,
    anomaly: plan.anomaly,
    projectedMutations: projected,
  }
}

const aggregatePlan = (
  hotmart: ChildResult,
  curseduca: ChildResult,
  sourceTotal: number,
  hotmartProjected: number,
  curseducaProjected: number,
): AllSyncPlan => ({
  operation: 'all-sync',
  dryRun: true,
  sourceLimit: ALL_SYNC_SOURCE_LIMIT,
  effectiveMutationLimit: ALL_SYNC_EFFECTIVE_MUTATION_LIMIT,
  sourceTotal,
  projectedMutations: hotmartProjected + curseducaProjected,
  withinLimit: sourceTotal <= ALL_SYNC_SOURCE_LIMIT
    && hotmartProjected + curseducaProjected <= ALL_SYNC_EFFECTIVE_MUTATION_LIMIT,
  hotmart: childPlan(hotmart, hotmartProjected),
  curseduca: childPlan(curseduca, curseducaProjected),
  discord: DISCORD_NOOP,
})

function failedChild(): ChildResult {
  return {
    success: false,
    stats: { ...EMPTY_STATS, errors: 1 },
    errorMessage: FAILURE,
  }
}

function skippedChild(): ChildResult {
  return {
    success: false,
    stats: { ...EMPTY_STATS, skipped: 1 },
  }
}

function isOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError'
}

function assertSourceBudget(hotmart: UniversalSourceItem[], curseduca: UniversalSourceItem[]): void {
  if (hotmart.length > ALL_SYNC_SOURCE_LIMIT) throw new Error('ALL_SYNC_HOTMART_SOURCE_LIMIT_EXCEEDED')
  if (curseduca.length > ALL_SYNC_SOURCE_LIMIT) throw new Error('ALL_SYNC_CURSEDUCA_SOURCE_LIMIT_EXCEEDED')
  if (hotmart.length + curseduca.length > ALL_SYNC_SOURCE_LIMIT) {
    throw new Error('ALL_SYNC_SOURCE_LIMIT_EXCEEDED')
  }
}

function addStats(left: ILastRunStats, right: ILastRunStats): ILastRunStats {
  return {
    total: left.total + right.total,
    inserted: left.inserted + right.inserted,
    updated: left.updated + right.updated,
    errors: left.errors + right.errors,
    skipped: left.skipped + right.skipped,
  }
}

export async function runAllSyncs(
  job: AllSyncJob,
  options: AllSyncOptions & AllSyncDependencies,
): Promise<{
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: AllSyncPlan
  data?: { discord: typeof DISCORD_NOOP }
}> {
  const { fetchHotmart, fetchCurseduca, executeUniversalSync } = options
  const sourceOptions: AllSyncOptions = {
    dryRun: options.dryRun,
    phaseHooks: options.phaseHooks,
    triggeredBy: options.triggeredBy,
  }
  let hotmartSource: UniversalSourceItem[]
  let curseducaSource: UniversalSourceItem[]
  try {
    const sources = await Promise.all([
      fetchHotmart(sourceOptions),
      fetchCurseduca(sourceOptions),
    ])
    hotmartSource = sources[0]
    curseducaSource = sources[1]
  } catch (error: unknown) {
    if (isOwnershipError(error)) throw error
    return { success: false, stats: { ...EMPTY_STATS, errors: 1 }, errorMessage: FAILURE }
  }
  if (!Array.isArray(hotmartSource) || !Array.isArray(curseducaSource)) {
    return { success: false, stats: { ...EMPTY_STATS, errors: 1 }, errorMessage: FAILURE }
  }
  assertSourceBudget(hotmartSource, curseducaSource)

  const preflightOptions: AllSyncOptions = {
    ...options,
    phaseHooks: preflightHooks(options.phaseHooks),
  }

  // Both child local plans must settle before either live child is allowed to
  // enter UniversalSync's report/history/write phase.
  const preflightSettled = await Promise.allSettled([
    executeUniversalSync(childRequest(job, 'hotmart', hotmartSource, preflightOptions, true)),
    executeUniversalSync(childRequest(job, 'curseduca', curseducaSource, preflightOptions, true)),
  ])
  const hotmartPreflight = normalisePreflight('hotmart', preflightSettled[0])
  const curseducaPreflight = normalisePreflight('curseduca', preflightSettled[1])
  const hotmartProjected = projectedMutations(preflightSettled[0].status === 'fulfilled' ? preflightSettled[0].value : undefined)
  const curseducaProjected = projectedMutations(preflightSettled[1].status === 'fulfilled' ? preflightSettled[1].value : undefined)
  if (!hotmartPreflight.success || !curseducaPreflight.success
    || !safeInt(hotmartProjected) || !safeInt(curseducaProjected)) {
    return {
      success: false,
      stats: { ...EMPTY_STATS, errors: 1 },
      errorMessage: FAILURE,
    }
  }
  const effectiveTotal = hotmartProjected + curseducaProjected
  if (effectiveTotal > ALL_SYNC_EFFECTIVE_MUTATION_LIMIT) {
    return {
      success: false,
      stats: { ...EMPTY_STATS, errors: 1 },
      errorMessage: FAILURE,
    }
  }

  const plan = aggregatePlan(
    hotmartPreflight,
    curseducaPreflight,
    hotmartSource.length + curseducaSource.length,
    hotmartProjected,
    curseducaProjected,
  )
  if (options.dryRun === true) {
    return {
      success: true,
      stats: { ...EMPTY_STATS, skipped: 1 },
      dryRun: true,
      plan,
      data: { discord: DISCORD_NOOP },
    }
  }

  let hotmart: ChildResult
  try {
    hotmart = normaliseChild(
      'hotmart',
      await executeUniversalSync(childRequest(job, 'hotmart', hotmartSource, options, false)),
      false,
    )
  } catch (error: unknown) {
    if (isOwnershipError(error)) throw error
    hotmart = failedChild()
  }

  // Do not start the second local writer after the first live child failed.
  // The aggregate receipt then settles indeterminate when a provider/local
  // phase already started, instead of racing two child lifecycles.
  let curseduca: ChildResult
  if (!hotmart.success) {
    curseduca = skippedChild()
  } else {
    try {
      curseduca = normaliseChild(
        'curseduca',
        await executeUniversalSync(childRequest(job, 'curseduca', curseducaSource, options, false)),
        false,
      )
    } catch (error: unknown) {
      if (isOwnershipError(error)) throw error
      curseduca = failedChild()
    }
  }
  const stats = addStats(addStats(hotmart.stats, curseduca.stats), { ...EMPTY_STATS, skipped: 1 })
  const errors = [hotmart.errorMessage, curseduca.errorMessage].filter((message): message is string => Boolean(message))
  return {
    success: hotmart.success && curseduca.success,
    stats,
    errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
    data: { discord: DISCORD_NOOP },
  }
}
