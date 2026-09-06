import logger from '../../../utils/logger'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import {
  expireStaleRoleChanges,
  generateDiscordRolesPlan,
  isRolesAutoExecuteEnabled,
  isRolesSyncEnabled,
  type DiscordPlanReport,
} from './planning'
import {
  assertDiscordPlanInputsWithinCap,
  persistDiscordPlanSnapshot,
  prepareDiscordRolesPlanSnapshot,
  resolveDiscordPlanSnapshotEmails,
} from './planSnapshot'
import { assertEffectiveRoleExecutionCapacity } from './executionSnapshot'
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
  assertEffectiveRoleExecutionCapacity(
    snapshot.existing,
    snapshot.pending.map((change) => ({ sourceRef: change.discordUserId })),
    undefined,
    snapshot.existingOverflow,
  )
  snapshot = await resolveDiscordPlanSnapshotEmails(snapshot)
  if (snapshot.report.anomalyAborted) {
    logger.error('🚨 [DiscordRoles] Plano abortado por anomalia — nada executado')
    return { expired: 0, plan: snapshot.report, execution: null }
  }

  const expired = await expireStaleRoleChanges(options.phaseHooks)
  const created = await persistDiscordPlanSnapshot(snapshot, options.phaseHooks)
  const plan = snapshot.report

  let execution: DiscordExecuteReport | null = null
  if (isRolesSyncEnabled() && (isRolesAutoExecuteEnabled() || options.triggeredBy === 'MANUAL')) {
    execution = await executeDiscordRolesPlan({
      includePlanned: true,
      executedBy: options.triggeredBy === 'MANUAL' ? 'manual:DiscordRolesSync' : 'cron:DiscordRolesSync',
      strictCap: true,
      preparedChanges: [...snapshot.existing, ...created],
      skipExpiry: true,
      phaseHooks: options.phaseHooks,
    })
  } else {
    logger.info('📋 [DiscordRoles] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, plan, execution }
}
