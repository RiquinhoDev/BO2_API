import logger from '../utils/logger'
import CronExecution from '../models/cron/CronExecution'
import { MAX_PROVIDER_READ_ITEMS } from '../security/providerReadBatchPolicy'
import type { CronExecutionCleanupPlan } from '../types/cron.types'
import type { CronExecutionPhaseHooks } from '../services/cron/scheduler/executionPhases'

export const CRON_EXECUTION_CLEANUP_RETENTION_DAYS = 90
export const CRON_EXECUTION_CLEANUP_MIN_RECORDS = 100
export const CRON_EXECUTION_CLEANUP_MAX_CANDIDATES = MAX_PROVIDER_READ_ITEMS

export interface CronExecutionCleanupOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
  now?: () => Date
}

export interface CronExecutionCleanupResult {
  success: boolean
  deleted: number
  remaining: number
  error?: string
  dryRun?: boolean
  plan?: CronExecutionCleanupPlan
}

type CleanupInvocation = boolean | CronExecutionCleanupOptions

function cutoffFor(now: Date): Date {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - CRON_EXECUTION_CLEANUP_RETENTION_DAYS)
  return cutoff
}

function planFor(
  totalBefore: number,
  eligible: number,
  wouldDelete: number,
  truncated: boolean,
): CronExecutionCleanupPlan {
  return {
    operation: 'cron-execution-cleanup',
    dryRun: true,
    totalBefore,
    eligible,
    wouldDelete,
    minimumToKeep: CRON_EXECUTION_CLEANUP_MIN_RECORDS,
    limit: CRON_EXECUTION_CLEANUP_MAX_CANDIDATES,
    truncated,
    remaining: truncated ? 1 : 0,
  }
}

async function boundedEligibleIds(cutoffDate: Date): Promise<{
  ids: unknown[]
  truncated: boolean
}> {
  const rows = await CronExecution.find({ startTime: { $lt: cutoffDate } })
    .sort({ startTime: 1, _id: 1 })
    .select({ _id: 1 })
    .limit(CRON_EXECUTION_CLEANUP_MAX_CANDIDATES + 1)
    .lean()
    .exec()
  const truncated = rows.length > CRON_EXECUTION_CLEANUP_MAX_CANDIDATES
  return {
    ids: rows
      .slice(0, CRON_EXECUTION_CLEANUP_MAX_CANDIDATES)
      .map(row => row._id),
    truncated,
  }
}

async function revalidateIds(ids: unknown[], cutoffDate: Date): Promise<unknown[]> {
  const rows = await CronExecution.find({
    _id: { $in: ids },
    startTime: { $lt: cutoffDate },
  })
    .sort({ startTime: 1, _id: 1 })
    .select({ _id: 1 })
    .limit(ids.length + 1)
    .lean()
    .exec()
  return rows.map(row => row._id)
}

function hasSameIds(expected: unknown[], actual: unknown[]): boolean {
  if (expected.length !== actual.length) return false
  const actualIds = new Set(actual.map(String))
  return expected.every(id => actualIds.has(String(id)))
}

async function cleanupOldExecutions(
  options: CronExecutionCleanupOptions,
): Promise<CronExecutionCleanupResult> {
  const now = options.now?.() ?? new Date()
  const cutoffDate = cutoffFor(now)
  options.phaseHooks?.assertOwnership?.()

  const totalBefore = await CronExecution.countDocuments()
  options.phaseHooks?.assertOwnership?.()
  const candidateSet = await boundedEligibleIds(cutoffDate)
  const eligible = candidateSet.ids.length
  const initialBudget = Math.max(0, totalBefore - CRON_EXECUTION_CLEANUP_MIN_RECORDS)

  if (options.dryRun === true) {
    const wouldDelete = Math.min(eligible, initialBudget)
    return {
      success: true,
      deleted: 0,
      remaining: totalBefore,
      dryRun: true,
      plan: planFor(totalBefore, eligible, wouldDelete, candidateSet.truncated),
    }
  }

  if (initialBudget === 0 || eligible === 0) {
    return {
      success: true,
      deleted: 0,
      remaining: totalBefore,
      error: initialBudget === 0
        ? `Proteção ativada: manter mínimo de ${CRON_EXECUTION_CLEANUP_MIN_RECORDS} registos`
        : undefined,
      plan: planFor(totalBefore, eligible, 0, candidateSet.truncated),
    }
  }

  options.phaseHooks?.assertOwnership?.()
  const totalAtDelete = await CronExecution.countDocuments()
  const deleteBudget = Math.max(0, totalAtDelete - CRON_EXECUTION_CLEANUP_MIN_RECORDS)
  const selectedIds = candidateSet.ids.slice(0, Math.min(deleteBudget, eligible))
  const plan = planFor(totalBefore, eligible, selectedIds.length, candidateSet.truncated)

  if (deleteBudget === 0 || selectedIds.length === 0) {
    return {
      success: true,
      deleted: 0,
      remaining: totalAtDelete,
      error: `Proteção ativada: manter mínimo de ${CRON_EXECUTION_CLEANUP_MIN_RECORDS} registos`,
      plan,
    }
  }

  options.phaseHooks?.assertOwnership?.()
  const revalidatedIds = await revalidateIds(selectedIds, cutoffDate)
  options.phaseHooks?.assertOwnership?.()
  if (!hasSameIds(selectedIds, revalidatedIds)) {
    return {
      success: false,
      deleted: 0,
      remaining: totalAtDelete,
      error: 'Revalidação dos candidatos falhou; nenhuma remoção efetuada',
      plan: planFor(totalBefore, eligible, 0, candidateSet.truncated),
    }
  }

  options.phaseHooks?.localMutationStarted()
  options.phaseHooks?.assertOwnership?.()
  const result = await CronExecution.deleteMany({ _id: { $in: selectedIds } })
  const remaining = await CronExecution.countDocuments()

  return {
    success: true,
    deleted: result.deletedCount,
    remaining,
    plan,
  }
}

export async function runCleanupManually(
  invocation: CleanupInvocation = {},
): Promise<CronExecutionCleanupResult> {
  const options: CronExecutionCleanupOptions = typeof invocation === 'boolean'
    ? { dryRun: invocation }
    : invocation
  logger.info(`🧹 Executando limpeza CRON${options.dryRun ? ' (DRY RUN)' : ''}`)
  return cleanupOldExecutions(options)
}

export default {
  run: runCleanupManually,
}
