import { UserProduct } from '../../../models'
import logger from '../../../utils/logger'
import {
  EXPIRATION_DAYS,
  formatDateOnly,
  type Clock,
} from './hotmartExpiration'
import type { ApprovedRenewalDecision } from './renewalPolicy'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'

const systemClock: Clock = { now: () => new Date() }

export async function applyAutoReactivation(
  userId: string,
  userEmail: string,
  decision: ApprovedRenewalDecision,
  clock: Clock = systemClock,
  phaseHooks?: CronExecutionPhaseHooks,
  userProductEffectCount = 1,
): Promise<void> {
  logger.info('🔄 [RenewalDetection] REATIVAÇÃO AUTOMÁTICA!')
  logger.info(`   📧 User: ${userEmail}`)

  if (decision.evidence.kind === 'class') {
    logger.info(
      `   📅 Acesso OGI: válido até ${formatDateOnly(decision.evidence.accessEnd)} (${
        decision.evidence.className || 'turma sem nome'
      })`,
    )
  } else {
    logger.info(
      `   💳 Purchase: ${decision.evidence.purchaseDate.toISOString().split('T')[0]} (${
        decision.evidence.daysSincePurchase
      } dias, limite ${EXPIRATION_DAYS})`,
    )
  }

  logger.info(`✅ [AutoReactivation] Reativando ${userEmail}...`)

  phaseHooks?.assertOwnership?.()
  phaseHooks?.localMutationStarted()
  phaseHooks?.consumeMutation?.(Math.max(1, userProductEffectCount))
  const result = await UserProduct.updateMany({ userId }, { $set: { status: 'ACTIVE' } })
  if (
    phaseHooks
    && userProductEffectCount > 0
    && typeof result.matchedCount === 'number'
    && result.matchedCount !== userProductEffectCount
  ) {
    throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
  }

  // The removed legacy Discord call targeted an endpoint that never existed.
  // Renewal roles are reconciled nightly by DiscordRolesSync.
  logger.info(`✅ [AutoReactivation] ${userEmail} reativado com sucesso!`)
}
