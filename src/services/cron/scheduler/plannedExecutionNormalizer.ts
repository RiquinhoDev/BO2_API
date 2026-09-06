import type { DiscordRolesSyncPlan, RenewalAcSyncPlan } from '../../../types/cron.types'
import type { CronDispatchResult } from './jobDispatcher'

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

export function normalizePlannedExecution(
  value: unknown,
  totalKey: 'accountsDesired' | 'classChangesSeen',
): CronDispatchResult {
  const report = recordOf(value)
  const plan = recordOf(report.plan)
  const execution = recordOf(report.execution)
  const anomalyAborted = booleanOf(plan, 'anomalyAborted') === true
  const blocked = totalKey === 'classChangesSeen' ? numberOf(plan, 'blocked') : 0
  const notInGuild = totalKey === 'accountsDesired' ? numberOf(execution, 'notInGuild') : 0
  const failed = numberOf(execution, 'failed')
  const dryRun = booleanOf(report, 'dryRun') === true || booleanOf(plan, 'dryRun') === true
  const renewalPlan = totalKey === 'classChangesSeen' && plan.operation === 'renewal-ac-sync'
    ? {
      operation: 'renewal-ac-sync' as const,
      dryRun: true as const,
      windowHours: numberOf(plan, 'windowHours'),
      classChangesSeen: numberOf(plan, 'classChangesSeen'),
      anomalyAborted: booleanOf(plan, 'anomalyAborted') === true,
      planned: numberOf(plan, 'planned'),
      blocked: numberOf(plan, 'blocked'),
      skippedDuplicates: numberOf(plan, 'skippedDuplicates'),
      refundReverts: numberOf(plan, 'refundReverts'),
      overCap: booleanOf(plan, 'overCap') === true,
      limit: numberOf(plan, 'limit'),
      truncated: booleanOf(plan, 'truncated') === true,
      remaining: numberOf(plan, 'remaining'),
    } satisfies RenewalAcSyncPlan
    : undefined
  const discordPlan = totalKey === 'accountsDesired' && dryRun
    ? {
      operation: 'discord-roles-sync' as const,
      dryRun: true as const,
      isBackfill: booleanOf(plan, 'isBackfill') === true,
      studentsWithClass: numberOf(plan, 'studentsWithClass'),
      studentsLinked: numberOf(plan, 'studentsLinked'),
      accountsDesired: numberOf(plan, 'accountsDesired'),
      invalidTurma: numberOf(plan, 'invalidTurma'),
      planned: numberOf(plan, 'planned'),
      newAssignments: numberOf(plan, 'newAssignments'),
      realChanges: numberOf(plan, 'realChanges'),
      removals: numberOf(plan, 'removals'),
      skippedDuplicates: numberOf(plan, 'skippedDuplicates'),
      anomalyAborted: booleanOf(plan, 'anomalyAborted') === true,
      overCap: booleanOf(plan, 'overCap') === true,
      limit: numberOf(plan, 'limit'),
      truncated: booleanOf(plan, 'truncated') === true,
      remaining: numberOf(plan, 'remaining'),
    } satisfies DiscordRolesSyncPlan
    : undefined
  const errorMessage = totalKey === 'classChangesSeen' && anomalyAborted
    ? 'Plano Renewal AC abortado por anomalia'
    : totalKey === 'accountsDesired' && anomalyAborted
      ? 'Plano Discord abortado por anomalia'
      : undefined
  return {
    success: !anomalyAborted && failed === 0,
    stats: {
      total: numberOf(plan, totalKey),
      inserted: numberOf(plan, 'planned'),
      updated: numberOf(execution, 'applied'),
      errors: failed + (anomalyAborted ? 1 : 0),
      skipped: blocked + numberOf(plan, 'skippedDuplicates') + notInGuild,
    },
    errorMessage,
    ...(dryRun ? { dryRun: true } : {}),
    ...(renewalPlan ? { plan: renewalPlan } : discordPlan ? { plan: discordPlan } : {}),
  }
}
