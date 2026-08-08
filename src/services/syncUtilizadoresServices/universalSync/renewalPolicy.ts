// ════════════════════════════════════════════════════════════
// 📁 universalSync/renewalPolicy.ts
// Hotmart renewal policy: the pure decision of whether an inactive-in-DB user
// with still-valid access should be reactivated (detectRenewal), and the
// executor that applies that reactivation to User + UserProduct
// (applyAutoReactivation). Only Hotmart carries the OGI class + purchaseDate
// this policy reasons about.
// ════════════════════════════════════════════════════════════

import User, { IUser } from '../../../models/user'
import { UserProduct } from '../../../models'
import type { UniversalSyncType } from '../../../types/universalSync.types'
import { EXPIRATION_DAYS, formatDateOnly, getActiveHotmartClassForExpiration, type HotmartExpirationPolicy } from './hotmartExpiration'
import { buildCanonicalActiveUserStatusUpdate } from './canonicalUserStatus'

export interface RenewalDetectionResult {
  wasInactivated: boolean
  shouldReactivate: boolean
  reactivationReason?: string
  inactivatedAt?: Date
  purchaseDate?: Date
}

/**
 * Pure decision: a Hotmart user that is INACTIVE in the DB but whose OGI access
 * is still valid (not expired) renewed or was wrongly inactivated, so it should
 * be reactivated. No I/O — reasons only over the in-memory user + purchaseDate.
 */
export function detectRenewal(
  user: IUser,
  purchaseDate: Date | null,
  syncType: UniversalSyncType,
  policy: HotmartExpirationPolicy,
): RenewalDetectionResult {
  const result: RenewalDetectionResult = {
    wasInactivated: false,
    shouldReactivate: false,
  }

  // Só para Hotmart (turma OGI e purchaseDate são dados desta plataforma)
  if (syncType !== 'hotmart') {
    return result
  }

  const activeClass = getActiveHotmartClassForExpiration(user)
  const expiration = policy.evaluate(purchaseDate, activeClass?.className)
  if (!expiration.canEvaluate) {
    return result
  }

  const isInactiveInDB = user.combined?.status === 'INACTIVE'

  if (purchaseDate) {
    result.purchaseDate = purchaseDate
  }

  if (isInactiveInDB && !expiration.isExpired) {
    // Está inativo na BD mas o acesso ainda é válido → renovou ou foi inativado indevidamente
    result.wasInactivated = true
    result.shouldReactivate = true
    result.reactivationReason = 'sync'
    console.log(`🔄 [RenewalDetection] REATIVAÇÃO AUTOMÁTICA!`)
    console.log(`   📧 User: ${user.email}`)
    if (expiration.accessEndOgi) {
      console.log(`   📅 Acesso OGI: válido até ${formatDateOnly(expiration.accessEndOgi)} (${activeClass?.className || 'turma sem nome'})`)
    } else if (purchaseDate) {
      console.log(`   💳 Purchase: ${purchaseDate.toISOString().split('T')[0]} (${expiration.daysSincePurchase} dias, limite ${EXPIRATION_DAYS})`)
    }
  }

  return result
}

export interface InactiveAutofixPlan {
  reactivate: boolean
  /** Human-readable validity reason for the reactivation log; set when reactivate is true. */
  validUntil?: string
}

/**
 * Pure decision for the "recent purchase but still INACTIVE" auto-fix: when
 * detectRenewal did not already reactivate, a Hotmart user that is INACTIVE in
 * the DB yet whose access is evaluable and not expired should be reactivated.
 * No I/O — the caller resolves the active class name and applies the effects.
 */
export function planInactiveAutofix(
  user: IUser,
  purchaseDate: Date | null,
  activeClassName: string | undefined,
  policy: HotmartExpirationPolicy,
): InactiveAutofixPlan {
  const isInactiveInDB = user.combined?.status === 'INACTIVE'
  const expiration = policy.evaluate(purchaseDate, activeClassName)

  if (isInactiveInDB && expiration.canEvaluate && !expiration.isExpired) {
    const validUntil = expiration.accessEndOgi
      ? `acesso válido até ${formatDateOnly(expiration.accessEndOgi)}`
      : `compra recente (${expiration.daysSincePurchase}d)`
    return { reactivate: true, validUntil }
  }

  return { reactivate: false }
}

/**
 * Executor: applies the reactivation decided by detectRenewal — flips the User
 * back to the canonical ACTIVE status and reactivates its UserProducts.
 */
export async function applyAutoReactivation(
  userId: string,
  userEmail: string,
  renewalResult: RenewalDetectionResult,
): Promise<void> {
  console.log(`✅ [AutoReactivation] Reativando ${userEmail}...`)

  // 1. Atualizar User
  await User.findByIdAndUpdate(userId, {
    $set: {
      ...buildCanonicalActiveUserStatusUpdate(),
      // Atualizar dados de inativação
      'inactivation.isManuallyInactivated': false,
      'inactivation.reactivatedAt': new Date(),
      'inactivation.reactivatedBy': 'Sistema - Sync Automático',
      'inactivation.reactivationReason': renewalResult.reactivationReason,
    },
  })

  // 2. Atualizar UserProduct
  await UserProduct.updateMany({ userId }, { $set: { status: 'ACTIVE' } })

  // Nota (2026-07-11): a chamada legacy ao Discord (`${DISCORD_BOT_URL}/add-roles`)
  // foi removida — esse endpoint nunca existiu no repo API (o fetch levava 404 e o log
  // "Roles restaurados" era falso). Os cargos R.* de renovação são reconciliados de
  // noite pelo DiscordRolesSync.

  console.log(`✅ [AutoReactivation] ${userEmail} reativado com sucesso!`)
}
