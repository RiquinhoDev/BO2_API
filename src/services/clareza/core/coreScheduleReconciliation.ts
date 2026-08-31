export interface PersistedCoreSchedule {
  readonly id: string
  readonly name: string
  readonly syncType: string
  readonly cronExpression: string
  readonly timezone: string
  readonly enabled: boolean
}

export interface DisabledCoreScheduleCandidate {
  readonly name: string
  readonly cronExpression: string
  readonly timezone: 'Europe/Lisbon'
  readonly enabled: false
}

export type CoreScheduleReconciliationAction =
  | { readonly kind: 'create-disabled'; readonly desired: DisabledCoreScheduleCandidate }
  | { readonly kind: 'update-disabled'; readonly id: string; readonly desired: DisabledCoreScheduleCandidate }
  | { readonly kind: 'review-legacy'; readonly id: string; readonly name: string; readonly enabled: boolean }
  | { readonly kind: 'conflict'; readonly ids: readonly string[]; readonly reason: 'duplicate-canonical-schedules' }

function validateCandidate(candidate: DisabledCoreScheduleCandidate): void {
  if (candidate.enabled !== false) {
    throw new Error('schedule candidate must remain disabled before rollout')
  }
  if (!candidate.name.trim()) throw new RangeError('schedule candidate name is required')
  if (candidate.timezone !== 'Europe/Lisbon') {
    throw new RangeError('schedule candidate timezone must be Europe/Lisbon')
  }
  if (candidate.cronExpression.trim().split(/\s+/).length !== 5) {
    throw new RangeError('schedule candidate requires a five-field cron expression')
  }
}

function matches(
  current: PersistedCoreSchedule,
  desired: DisabledCoreScheduleCandidate,
): boolean {
  return current.cronExpression === desired.cronExpression
    && current.timezone === desired.timezone
    && current.enabled === desired.enabled
}

export function planCoreScheduleReconciliation(
  current: readonly PersistedCoreSchedule[],
  desired: DisabledCoreScheduleCandidate,
): readonly CoreScheduleReconciliationAction[] {
  validateCandidate(desired)
  const canonical = current.filter(schedule => (
    schedule.syncType === 'clareza' && schedule.name === desired.name
  ))
  if (canonical.length > 1) {
    return [{
      kind: 'conflict',
      ids: canonical.map(schedule => schedule.id).sort(),
      reason: 'duplicate-canonical-schedules',
    }]
  }

  const actions: CoreScheduleReconciliationAction[] = []
  if (!canonical.length) actions.push({ kind: 'create-disabled', desired })
  else if (!matches(canonical[0], desired)) {
    actions.push({ kind: 'update-disabled', id: canonical[0].id, desired })
  }

  const legacy = current.filter(schedule => (
    schedule.syncType === 'clareza' && schedule.name !== desired.name
  )).sort((left, right) => left.id.localeCompare(right.id))
  actions.push(...legacy.map(schedule => ({
    kind: 'review-legacy' as const,
    id: schedule.id,
    name: schedule.name,
    enabled: schedule.enabled,
  })))
  return actions
}
