import logger from '../../../utils/logger'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import {
  ALL_RENEWAL_ROLE_IDS,
  expireStaleRoleChanges,
  generateDiscordRolesPlan,
  isRolesAutoExecuteEnabled,
  isRolesSyncEnabled,
  ROLE_NAME_BY_ID,
  type DiscordPlanReport,
} from './planning'
import {
  assertDiscordPlanInputsWithinCap,
  persistDiscordPlanSnapshot,
  prepareDiscordRolesPlanSnapshot,
  resolveDiscordPlanSnapshotEmails,
} from './planSnapshot'
import {
  assertEffectiveRoleExecutionCapacity,
  canonicalizePreparedRoleChanges,
} from './executionSnapshot'
import {
  executeDiscordRolesPlan,
  type DiscordExecuteReport,
} from './execution'

export interface DiscordCronReport {
  expired: number
  plan: DiscordPlanReport
  execution: DiscordExecuteReport | null
}

export interface DiscordJobOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
  triggeredBy?: 'CRON' | 'MANUAL'
}

export async function runDiscordRolesSyncJob(options: DiscordJobOptions = {}): Promise<DiscordCronReport> {
  if (options.dryRun) {
    return {
      expired: 0,
      plan: await generateDiscordRolesPlan({ dryRun: true }),
      execution: null,
    }
  }

  let snapshot = await prepareDiscordRolesPlanSnapshot()
  assertDiscordPlanInputsWithinCap(snapshot.report)
  if (options.triggeredBy === 'MANUAL') {
    assertEffectiveRoleExecutionCapacity(
      snapshot.existing,
      snapshot.pending.map((change) => ({ sourceRef: change.discordUserId })),
      undefined,
      snapshot.existingOverflow,
    )
  }
  snapshot = await resolveDiscordPlanSnapshotEmails(snapshot)
  if (snapshot.report.anomalyAborted) {
    logger.error('🚨 [DiscordRoles] Plano abortado por anomalia — nada executado')
    return { expired: 0, plan: snapshot.report, execution: null }
  }

  // Canonicalize bounded input before expiry or any create. Conflicts fail closed
  // while local state is still untouched.
  canonicalizePreparedRoleChanges([
    ...snapshot.existingGroups.flatMap((group) => group.members),
    ...snapshot.pending.map((pending) => {
      const addRoleId = pending.desired?.roleId || null
      const removeRoleIds = ALL_RENEWAL_ROLE_IDS.filter((id) => id !== addRoleId)
      return {
        discordUserId: pending.discordUserId,
        payload: {
          addRoleId,
          addRoleName: addRoleId ? ROLE_NAME_BY_ID.get(addRoleId) : null,
          removeRoleIds,
          removeRoleNames: removeRoleIds.map((id) => ROLE_NAME_BY_ID.get(id) || id),
        },
      }
    }),
  ])

  const expired = await expireStaleRoleChanges(options.phaseHooks)
  const created = await persistDiscordPlanSnapshot(snapshot, options.phaseHooks)
  const plan = snapshot.report

  let execution: DiscordExecuteReport | null = null
  if (isRolesSyncEnabled() && (isRolesAutoExecuteEnabled() || options.triggeredBy === 'MANUAL')) {
    execution = await executeDiscordRolesPlan({
      includePlanned: true,
      executedBy: options.triggeredBy === 'MANUAL' ? 'manual:DiscordRolesSync' : 'cron:DiscordRolesSync',
      strictCap: options.triggeredBy === 'MANUAL',
      preparedGroups: snapshot.existingGroups,
      preparedChanges: [...snapshot.existing, ...created],
      skipExpiry: true,
      phaseHooks: options.phaseHooks,
    })
    execution.leftForNextRun = Math.max(execution.leftForNextRun, snapshot.existingRemaining)
  } else {
    logger.info('📋 [DiscordRoles] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, plan, execution }
}
