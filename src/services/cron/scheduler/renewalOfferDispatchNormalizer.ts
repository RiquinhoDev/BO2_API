import type { ILastRunStats } from '../../../models/SyncModels/CronJobConfig'
import type { RenewalOfferSyncPlan } from '../../../types/cron.types'
import { RENEWAL_OFFER_LIMIT } from '../../renewal/renewalSync.types'

const FIXED_ERROR = 'Execução RenewalOfferSync falhou'
const COUNTER_KEYS = ['total', 'inserted', 'updated', 'errors', 'skipped', 'upserted', 'deactivated'] as const

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validCounter(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= RENEWAL_OFFER_LIMIT
}

function safeCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return validCounter(value) ? value : 0
}

export function sanitizeRenewalOfferPlan(value: unknown): Record<string, unknown> | undefined {
  const plan = recordOf(value)
  if (plan.operation !== 'renewal-offer-sync') return undefined
  for (const key of ['dryRun', 'truncated', 'anomaly']) {
    if (plan[key] !== undefined && typeof plan[key] !== 'boolean') return undefined
  }
  if (plan.dryRun !== true || plan.anomaly !== false || plan.truncated !== false) return undefined
  const numericKeys = ['create', 'update', 'reactivate', 'deactivate', 'unchanged', 'totalOperations', 'limit', 'remaining']
  if (numericKeys.some(key => plan[key] === undefined)) return undefined
  const safe: Record<string, unknown> = {
    operation: 'renewal-offer-sync',
    dryRun: true,
    truncated: false,
    anomaly: false,
  }
  for (const key of numericKeys) {
    if (plan[key] === undefined) continue
    if (!validCounter(plan[key])) return undefined
    safe[key] = plan[key]
  }
  const operationCount = ['create', 'update', 'reactivate', 'deactivate']
    .reduce((sum, key) => sum + (safe[key] as number), 0)
  if (safe.limit !== RENEWAL_OFFER_LIMIT
    || safe.totalOperations !== operationCount
    || operationCount > RENEWAL_OFFER_LIMIT
    || safe.remaining !== 0) {
    return undefined
  }
  return safe
}

function validReportEnvelope(report: Record<string, unknown>): boolean {
  if (typeof report.success !== 'boolean') return false
  if (report.dryRun !== undefined && report.dryRun !== true) return false
  if (COUNTER_KEYS.some(key => report[key] !== undefined && !validCounter(report[key]))) return false
  if (['total', 'inserted', 'updated', 'errors', 'skipped'].some(key => !validCounter(report[key]))) return false
  if (report.unknownNames !== undefined
    && (!Array.isArray(report.unknownNames) || report.unknownNames.length > RENEWAL_OFFER_LIMIT)) return false
  const plan = report.plan
  if (plan !== undefined && !sanitizeRenewalOfferPlan(plan)) return false
  if (report.dryRun === true && plan === undefined) return false
  if (report.dryRun !== true && plan !== undefined) return false
  return true
}

export function normalizeRenewalOfferDispatch(value: unknown): {
  success: boolean
  stats: ILastRunStats
  errorMessage?: string
  dryRun?: boolean
  plan?: RenewalOfferSyncPlan
} {
  const report = recordOf(value)
  const envelopeValid = isRecord(value) && validReportEnvelope(report)
  const errorsValid = report.errors === undefined || (typeof report.errors === 'number' && Number.isSafeInteger(report.errors) && report.errors >= 0)
  const errors = safeCount(report, 'errors')
  const successFlag = report.success === undefined || typeof report.success === 'boolean' ? report.success !== false : false
  const plan = sanitizeRenewalOfferPlan(report.plan)
  const planValid = report.plan === undefined ? report.dryRun !== true : plan !== undefined
  const success = envelopeValid && errorsValid && successFlag && errors === 0 && planValid
  const total = safeCount(report, 'total')
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
