import type { UniversalSyncType } from '../../../types/universalSync.types'
import {
  getActiveHotmartClassForExpiration,
  type HotmartClassCandidate,
  type HotmartExpirationPolicy,
} from './hotmartExpiration'

export interface RenewalUserState {
  combined?: { status?: string | null }
  hotmart?: { enrolledClasses?: HotmartClassCandidate[] }
}

export type RenewalEvidence =
  | { kind: 'class'; accessEnd: Date; className?: string }
  | { kind: 'purchase'; purchaseDate: Date; daysSincePurchase: number }

export interface ApprovedRenewalDecision {
  shouldReactivate: true
  reactivationReason: 'sync'
  evidence: RenewalEvidence
}

export type RenewalDetectionResult = { shouldReactivate: false } | ApprovedRenewalDecision

export function detectRenewal(
  user: RenewalUserState,
  purchaseDate: Date | null,
  syncType: UniversalSyncType,
  policy: HotmartExpirationPolicy,
): RenewalDetectionResult {
  if (syncType !== 'hotmart') return { shouldReactivate: false }

  const activeClass = getActiveHotmartClassForExpiration(user)
  const expiration = policy.evaluate(purchaseDate, activeClass?.className)
  if (
    user.combined?.status !== 'INACTIVE' ||
    !expiration.canEvaluate ||
    expiration.isExpired
  ) {
    return { shouldReactivate: false }
  }

  if (expiration.accessEndOgi) {
    return {
      shouldReactivate: true,
      reactivationReason: 'sync',
      evidence: {
        kind: 'class',
        accessEnd: expiration.accessEndOgi,
        className: activeClass?.className,
      },
    }
  }

  if (!purchaseDate) return { shouldReactivate: false }

  return {
    shouldReactivate: true,
    reactivationReason: 'sync',
    evidence: {
      kind: 'purchase',
      purchaseDate,
      daysSincePurchase: expiration.daysSincePurchase,
    },
  }
}

export type InactiveAutofixPlan =
  | { reactivate: false }
  | {
      reactivate: true
      validity:
        | { kind: 'class'; accessEnd: Date }
        | { kind: 'purchase'; daysSincePurchase: number }
    }

export function planInactiveAutofix(
  user: RenewalUserState,
  purchaseDate: Date | null,
  activeClassName: string | undefined,
  policy: HotmartExpirationPolicy,
): InactiveAutofixPlan {
  const expiration = policy.evaluate(purchaseDate, activeClassName)
  if (
    user.combined?.status !== 'INACTIVE' ||
    !expiration.canEvaluate ||
    expiration.isExpired
  ) {
    return { reactivate: false }
  }

  return expiration.accessEndOgi
    ? { reactivate: true, validity: { kind: 'class', accessEnd: expiration.accessEndOgi } }
    : {
        reactivate: true,
        validity: { kind: 'purchase', daysSincePurchase: expiration.daysSincePurchase },
      }
}
