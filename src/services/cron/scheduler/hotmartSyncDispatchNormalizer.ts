import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import type { HotmartSyncPlan } from '../../../types/cron.types'

const LIMIT = 20_000
const FAILURE = 'Execução Hotmart sync falhou'

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}

const safeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const sanitizePlan = (value: unknown): HotmartSyncPlan | undefined => {
  const plan = recordOf(value)
  if (plan.operation !== 'hotmart-sync' || plan.dryRun !== true) return undefined
  if (plan.limit !== LIMIT || plan.truncated !== false || plan.anomaly !== false) return undefined
  const safe: Record<string, unknown> = {
    operation: 'hotmart-sync', dryRun: true, truncated: false, anomaly: false, limit: LIMIT,
  }
  for (const key of ['total', 'inserted', 'updated', 'errors', 'skipped', 'remaining']) {
    if (!safeInt(plan[key])) return undefined
    safe[key] = plan[key]
  }
  const total = safe.total as number
  if (total > LIMIT || safe.errors !== 0) return undefined
  const counted = (safe.inserted as number) + (safe.updated as number) + (safe.errors as number) + (safe.skipped as number)
  if (counted !== total || (safe.remaining as number) !== 0) {
    return undefined
  }
  return safe as unknown as HotmartSyncPlan
}

export interface HotmartDispatchNormalizationOptions {
  requestedDryRun?: boolean
}

export function normalizeHotmartSyncDispatch(
  value: unknown,
  options: HotmartDispatchNormalizationOptions = {},
): {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: HotmartSyncPlan
} {
  const result = recordOf(value)
  const rawStats = recordOf(result.stats)
  const statsSource = Object.keys(rawStats).length > 0 ? rawStats : result
  const keys = ['total', 'inserted', 'updated', 'errors', 'skipped']
  const validStats = keys.every(key => safeInt(statsSource[key]))
    && (statsSource.total as number) <= LIMIT
    && (statsSource.inserted as number) + (statsSource.updated as number) + (statsSource.errors as number) + (statsSource.skipped as number) === (statsSource.total as number)
  const hasDryRun = Object.prototype.hasOwnProperty.call(result, 'dryRun')
  const dryRunValue = result.dryRun
  const validDryRunField = !hasDryRun || typeof dryRunValue === 'boolean'
  const validResultFlags = ['truncated', 'anomaly'].every((key) =>
    !Object.prototype.hasOwnProperty.call(result, key) || result[key] === false,
  )
  const dryRun = dryRunValue === true
  const dryRunStatsAreEmpty = !dryRun || keys.every(key => statsSource[key] === 0)
  const validRequestedMode = options.requestedDryRun === undefined
    ? validDryRunField
    : options.requestedDryRun === dryRun && validDryRunField
  const plan = dryRun ? sanitizePlan(result.plan) : undefined
  const planModeValid = dryRun
    ? plan !== undefined
    : !Object.prototype.hasOwnProperty.call(result, 'plan')
  const validSuccess = typeof result.success === 'boolean' && result.success === true
  const success = validSuccess && validStats && statsSource.errors === 0
    && dryRunStatsAreEmpty && validRequestedMode && validResultFlags && planModeValid
  const stats: ILastRunStats = validStats
    ? {
      total: statsSource.total as number,
      inserted: statsSource.inserted as number,
      updated: statsSource.updated as number,
      errors: statsSource.errors as number,
      skipped: statsSource.skipped as number,
    }
    : { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 }
  return {
    success,
    stats,
    ...(dryRun ? { dryRun: true } : {}),
    ...(success && plan ? { plan } : {}),
    ...(!success ? { errorMessage: FAILURE } : {}),
  }
}
