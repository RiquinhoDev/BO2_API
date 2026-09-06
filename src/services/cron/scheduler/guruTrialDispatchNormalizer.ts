import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'

const FIXED_ERROR = 'Execução Guru TrialCheck falhou'

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}

const numberOf = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function sanitizeGuruTrialPlan(value: unknown): Record<string, unknown> | undefined {
  const plan = recordOf(value)
  if (plan.operation !== 'guru-trial-check') return undefined
  for (const key of ['dryRun', 'truncated', 'anomaly']) {
    if (plan[key] !== undefined && typeof plan[key] !== 'boolean') return undefined
  }
  const numericKeys = ['candidates', 'synced', 'markedForInactivation', 'converted', 'stillInTrial', 'plannedMutations', 'errors', 'limit', 'remaining']
  const safe: Record<string, unknown> = {
    operation: 'guru-trial-check', dryRun: plan.dryRun === true,
    truncated: plan.truncated === true, anomaly: plan.anomaly === true,
  }
  for (const key of numericKeys) {
    if (plan[key] === undefined) continue
    if (typeof plan[key] !== 'number' || !Number.isSafeInteger(plan[key]) || plan[key] < 0) return undefined
    safe[key] = plan[key]
  }
  return safe
}

export function normalizeGuruTrialDispatch(value: unknown): {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: Record<string, unknown>
} {
  const report = recordOf(value)
  const errors = numberOf(report, 'errors')
  const errorsValid = report.errors === undefined || (typeof report.errors === 'number' && Number.isSafeInteger(report.errors) && report.errors >= 0)
  const successFlag = report.success === undefined || typeof report.success === 'boolean' ? report.success !== false : false
  const success = errorsValid && successFlag && errors === 0
  const plan = sanitizeGuruTrialPlan(report.plan)
  const updated = numberOf(report, 'updated') || (plan ? numberOf(report, 'synced') : 0)
  return {
    success,
    stats: { total: numberOf(report, 'total'), inserted: 0, updated, errors, skipped: numberOf(report, 'skipped') },
    ...(success ? {} : { errorMessage: FIXED_ERROR }),
    ...(report.dryRun === true ? { dryRun: true } : {}),
    ...(plan ? { plan } : {}),
  }
}
