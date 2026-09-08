import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import type { CurseducaSyncPlan } from '../../../types/cron.types'

const LIMIT = 20_000
const FAILURE = 'Execução CursEduca sync falhou'

const recordOf = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
const safeInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const sanitizePlan = (value: unknown): CurseducaSyncPlan | undefined => {
  const plan = recordOf(value)
  if (plan.operation !== 'curseduca-sync' || plan.dryRun !== true || plan.limit !== LIMIT || plan.truncated !== false || plan.anomaly !== false) return undefined
  const safe: Record<string, unknown> = { operation: 'curseduca-sync', dryRun: true, truncated: false, anomaly: false, limit: LIMIT }
  for (const key of ['total', 'inserted', 'updated', 'errors', 'skipped', 'remaining']) if (!safeInt(plan[key])) return undefined; else safe[key] = plan[key]
  const total = safe.total as number
  const counted = (safe.inserted as number) + (safe.updated as number) + (safe.errors as number) + (safe.skipped as number)
  if (total > LIMIT || safe.errors !== 0 || counted !== total || safe.remaining !== 0) return undefined
  return safe as unknown as CurseducaSyncPlan
}

export function normalizeCurseducaSyncDispatch(value: unknown, options: { requestedDryRun?: boolean } = {}): { success: boolean; stats: ILastRunStats; errorMessage?: string; dryRun?: boolean; plan?: CurseducaSyncPlan } {
  const result = recordOf(value)
  const rawStats = recordOf(result.stats)
  const source = Object.keys(rawStats).length > 0 ? rawStats : result
  const keys = ['total', 'inserted', 'updated', 'errors', 'skipped']
  const unchanged = source.unchanged === undefined ? 0 : source.unchanged
  const validStats = keys.every(key => safeInt(source[key])) && safeInt(unchanged) && (source.total as number) <= LIMIT
    && (source.inserted as number) + (source.updated as number) + (source.errors as number) + (source.skipped as number) + unchanged === (source.total as number)
  const dryRun = result.dryRun === true
  const validMode = !Object.prototype.hasOwnProperty.call(result, 'dryRun') || typeof result.dryRun === 'boolean'
  const requestedModeValid = options.requestedDryRun === undefined ? validMode : options.requestedDryRun === dryRun && validMode
  const plan = dryRun ? sanitizePlan(result.plan) : undefined
  const success = result.success === true && validStats && source.errors === 0 && (!dryRun || keys.every(key => source[key] === 0) && unchanged === 0) && requestedModeValid && (!dryRun || plan !== undefined) && (dryRun || !Object.prototype.hasOwnProperty.call(result, 'plan'))
  return {
    success,
    stats: validStats ? { total: source.total as number, inserted: source.inserted as number, updated: source.updated as number, errors: source.errors as number, skipped: source.skipped as number } : { total: 0, inserted: 0, updated: 0, errors: 1, skipped: 0 },
    ...(dryRun ? { dryRun: true } : {}), ...(success && plan ? { plan } : {}), ...(!success ? { errorMessage: FAILURE } : {}),
  }
}
