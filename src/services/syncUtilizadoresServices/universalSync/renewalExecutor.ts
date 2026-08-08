import User from '../../../models/user'
import { UserProduct } from '../../../models'
import logger from '../../../utils/logger'
import { buildCanonicalActiveUserStatusUpdate } from './canonicalUserStatus'
import {
  EXPIRATION_DAYS,
  formatDateOnly,
  type Clock,
} from './hotmartExpiration'
import type { ApprovedRenewalDecision } from './renewalPolicy'

const systemClock: Clock = { now: () => new Date() }

export async function applyAutoReactivation(
  userId: string,
  userEmail: string,
  decision: ApprovedRenewalDecision,
  clock: Clock = systemClock,
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

  await User.findByIdAndUpdate(userId, {
    $set: {
      ...buildCanonicalActiveUserStatusUpdate(),
      'inactivation.isManuallyInactivated': false,
      'inactivation.reactivatedAt': clock.now(),
      'inactivation.reactivatedBy': 'Sistema - Sync Automático',
      'inactivation.reactivationReason': decision.reactivationReason,
    },
  })

  await UserProduct.updateMany({ userId }, { $set: { status: 'ACTIVE' } })

  // The removed legacy Discord call targeted an endpoint that never existed.
  // Renewal roles are reconciled nightly by DiscordRolesSync.
  logger.info(`✅ [AutoReactivation] ${userEmail} reativado com sucesso!`)
}
