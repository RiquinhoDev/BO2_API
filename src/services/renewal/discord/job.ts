import logger from '../../../utils/logger'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import {
  assertDiscordPlanInputsWithinCap,
  expireStaleRoleChanges,
  generateDiscordRolesPlan,
  isRolesAutoExecuteEnabled,
  isRolesSyncEnabled,
  type DiscordPlanReport,
} from './planning'
import {
  executeDiscordRolesPlan,
  preflightRoleExecutionCapacity,
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

  const preview = await generateDiscordRolesPlan({ dryRun: true })
  assertDiscordPlanInputsWithinCap(preview)
  if (options.triggeredBy === 'MANUAL') await preflightRoleExecutionCapacity(preview.planned)

  const expired = await expireStaleRoleChanges(options.phaseHooks)
  const plan = await generateDiscordRolesPlan({ phaseHooks: options.phaseHooks })

  let execution: DiscordExecuteReport | null = null
  if (plan.anomalyAborted) {
    logger.error('🚨 [DiscordRoles] Plano abortado por anomalia — nada executado')
  } else if (isRolesSyncEnabled() && (isRolesAutoExecuteEnabled() || options.triggeredBy === 'MANUAL')) {
    execution = await executeDiscordRolesPlan({
      includePlanned: true,
      executedBy: options.triggeredBy === 'MANUAL' ? 'manual:DiscordRolesSync' : 'cron:DiscordRolesSync',
      strictCap: false,
      phaseHooks: options.phaseHooks,
    })
  } else {
    logger.info('📋 [DiscordRoles] Modo dry-run: plano gerado, execução aguarda switches/aprovação')
  }

  return { expired, plan, execution }
}
