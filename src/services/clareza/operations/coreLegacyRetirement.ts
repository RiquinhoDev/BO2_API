export interface LegacyRetirementInput {
  readonly legacyId: string
  readonly replacementId: string
  readonly observation: {
    readonly from: string
    readonly to: string
    readonly minimumDays: number
    readonly legacyRequests: number
  }
  readonly remainingConsumers: readonly string[]
  readonly replacementStable: boolean
  readonly rollbackAvailable: boolean
  readonly explicitRemovalAuthorization: boolean
}

export interface LegacyRetirementDecision {
  readonly status: 'blocked' | 'eligible'
  readonly blockers: readonly string[]
}

const dayMs = 24 * 60 * 60 * 1000

export function assessLegacyRetirement(input: LegacyRetirementInput): LegacyRetirementDecision {
  const blockers: string[] = []
  const from = Date.parse(input.observation.from)
  const to = Date.parse(input.observation.to)
  const validWindow = input.legacyId.trim() !== ''
    && input.replacementId.trim() !== ''
    && Number.isFinite(from)
    && Number.isFinite(to)
    && to > from
    && Number.isInteger(input.observation.minimumDays)
    && input.observation.minimumDays > 0
    && Number.isInteger(input.observation.legacyRequests)
    && input.observation.legacyRequests >= 0
  if (!validWindow) {
    blockers.push('observation-window-invalid')
  } else if ((to - from) / dayMs < input.observation.minimumDays) {
    blockers.push('observation-window-too-short')
  }
  if (validWindow && input.observation.legacyRequests > 0) blockers.push('legacy-traffic-observed')
  const consumers = [...new Set(input.remainingConsumers.map(value => value.trim()).filter(Boolean))].sort()
  if (consumers.length) blockers.push(`remaining-consumers:${consumers.join(',')}`)
  if (!input.replacementStable) blockers.push('replacement-not-stable')
  if (!input.rollbackAvailable) blockers.push('rollback-unavailable')
  if (!input.explicitRemovalAuthorization) blockers.push('removal-not-authorized')
  return { status: blockers.length ? 'blocked' : 'eligible', blockers }
}
