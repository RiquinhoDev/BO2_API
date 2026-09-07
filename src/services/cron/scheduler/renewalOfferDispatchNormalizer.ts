import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import type { RenewalOfferSyncPlan } from '../../../types/cron.types'
import { RENEWAL_OFFER_LIMIT } from '../../renewal/renewalSync.types'

const FIXED_ERROR = 'Execução RenewalOfferSync falhou'

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

function safeCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function sanitizeRenewalOfferPlan(value: unknown): Record<string, unknown> | undefined {
  const plan = recordOf(value)
  if (plan.operation !== 'renewal-offer-sync') return undefined
  for (const key of ['dryRun', 'truncated', 'anomaly']) {
    if (plan[key] !== undefined && typeof plan[key] !== 'boolean') return undefined
  }
  if (plan.dryRun !== true) return undefined
  const numericKeys = ['create', 'update', 'reactivate', 'deactivate', 'unchanged', 'totalOperations', 'limit', 'remaining']
  if (numericKeys.some(key => plan[key] === undefined)) return undefined
  const safe: Record<string, unknown> = {
    operation: 'renewal-offer-sync',
    dryRun: true,
    truncated: plan.truncated === true,
    anomaly: plan.anomaly === true,
  }
  for (const key of numericKeys) {
    if (plan[key] === undefined) continue
    if (typeof plan[key] !== 'number' || !Number.isSafeInteger(plan[key]) || plan[key] < 0) return undefined
    safe[key] = plan[key]
  }
  const operationCount = ['create', 'update', 'reactivate', 'deactivate']
    .reduce((sum, key) => sum + (safe[key] as number), 0)
  if (safe.limit !== RENEWAL_OFFER_LIMIT
    || safe.totalOperations !== operationCount
    || operationCount > RENEWAL_OFFER_LIMIT
    || (safe.truncated === false && safe.remaining !== 0)) {
    return undefined
  }
  return safe
}

export function normalizeRenewalOfferDispatch(value: unknown): {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: RenewalOfferSyncPlan
} {
  const report = recordOf(value)
  const errorsValid = report.errors === undefined || (typeof report.errors === 'number' && Number.isSafeInteger(report.errors) && report.errors >= 0)
  const errors = safeCount(report, 'errors')
  const successFlag = report.success === undefined || typeof report.success === 'boolean' ? report.success !== false : false
  const plan = sanitizeRenewalOfferPlan(report.plan)
  const planValid = report.plan === undefined ? report.dryRun !== true : plan !== undefined
  const success = errorsValid && successFlag && errors === 0 && planValid
  const total = safeCount(report, 'total') || safeCount(report, 'upserted') + safeCount(report, 'deactivated')
  const updated = Object.prototype.hasOwnProperty.call(report, 'updated')
    ? safeCount(report, 'updated')
    : safeCount(report, 'upserted')
  const skipped = Object.prototype.hasOwnProperty.call(report, 'skipped')
    ? safeCount(report, 'skipped')
    : Array.isArray(report.unknownNames) ? report.unknownNames.length : 0
  return {
    success,
    stats: { total, inserted: safeCount(report, 'inserted'), updated, errors, skipped },
    ...(success ? { errorMessage: undefined } : { errorMessage: FIXED_ERROR }),
    ...(report.dryRun === true ? { dryRun: true } : {}),
    ...(plan ? { plan: plan as unknown as RenewalOfferSyncPlan } : {}),
  }
}
