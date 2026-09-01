export type ClarezaTool = 'radar' | 'raiox' | 'carteira' | 'comparador' | 'earnings' | 'top10'
export type ClarezaDryRunStage = 'dr0' | 'dr1' | 'dr2' | 'dr3' | 'dr4' | 'dr5' | 'dr6'

export interface ClarezaRolloutReadinessInput {
  readonly tool: ClarezaTool
  readonly backendHead: string
  readonly frontendHead: string
  readonly routeContractAvailable: boolean
  readonly authorizationDecisionAccepted: boolean
  readonly globalGatesPass: boolean
  readonly dr: Readonly<Record<ClarezaDryRunStage, boolean>>
  readonly rollback: { readonly tested: boolean; readonly maxMinutes: number }
  readonly canary: {
    readonly percentage: number
    readonly observationMinutes: number
    readonly errorRateLimit: number
  }
  readonly explicitPromotionAuthorization: boolean
}

export interface ClarezaRolloutDecision {
  readonly status: 'blocked' | 'ready'
  readonly blockers: readonly string[]
}

const stages: readonly ClarezaDryRunStage[] = ['dr0', 'dr1', 'dr2', 'dr3', 'dr4', 'dr5', 'dr6']

export function assessClarezaRollout(input: ClarezaRolloutReadinessInput): ClarezaRolloutDecision {
  const blockers: string[] = []
  if (!input.backendHead.trim() || !input.frontendHead.trim()) blockers.push('candidate-identity-invalid')
  if (!input.routeContractAvailable) blockers.push('route-contract-unavailable')
  if (!input.authorizationDecisionAccepted) blockers.push('authorization-decision-pending')
  if (!input.globalGatesPass) blockers.push('global-gates-failed')
  const missingStages = stages.filter(stage => input.dr[stage] !== true)
  if (missingStages.length) blockers.push(`dry-run-incomplete:${missingStages.join(',')}`)
  if (!input.rollback.tested) blockers.push('rollback-not-tested')
  if (!Number.isFinite(input.rollback.maxMinutes) || input.rollback.maxMinutes <= 0 || input.rollback.maxMinutes > 120) {
    blockers.push('rollback-window-invalid')
  }
  const canary = input.canary
  if (!Number.isFinite(canary.percentage) || canary.percentage <= 0 || canary.percentage > 50
    || !Number.isFinite(canary.observationMinutes) || canary.observationMinutes <= 0
    || !Number.isFinite(canary.errorRateLimit) || canary.errorRateLimit < 0 || canary.errorRateLimit > 1) {
    blockers.push('canary-policy-invalid')
  }
  if (!input.explicitPromotionAuthorization) blockers.push('promotion-not-authorized')
  return { status: blockers.length ? 'blocked' : 'ready', blockers }
}
