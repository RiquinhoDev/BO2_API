import {
  planCoreScheduleReconciliation,
  type PersistedCoreSchedule,
} from '../../../src/services/clareza/core/coreScheduleReconciliation'

const desired = {
  name: 'ClarezaCoreDaily', cronExpression: '0 3 * * *',
  timezone: 'Europe/Lisbon', enabled: false,
} as const

describe('core schedule reconciliation plan', () => {
  it('proposes a disabled daily candidate and flags every legacy Clareza schedule for review', () => {
    const current: PersistedCoreSchedule[] = [
      { id: 'legacy', name: 'ClarezaRefresh', syncType: 'clareza',
        cronExpression: '0 6,12,18 * * *', timezone: 'Europe/Lisbon', enabled: true },
      { id: 'guru', name: 'GuruTrialCheck', syncType: 'guru',
        cronExpression: '0 7 * * *', timezone: 'Europe/Lisbon', enabled: true },
    ]

    expect(planCoreScheduleReconciliation(current, desired)).toEqual([
      { kind: 'create-disabled', desired },
      { kind: 'review-legacy', id: 'legacy', name: 'ClarezaRefresh', enabled: true },
    ])
    expect(current[0].enabled).toBe(true)
  })

  it('is idempotent when the disabled candidate already matches', () => {
    expect(planCoreScheduleReconciliation([{
      id: 'candidate', syncType: 'clareza', ...desired,
    }], desired)).toEqual([])
  })

  it('plans one update for drift and detects duplicate canonical candidates', () => {
    expect(planCoreScheduleReconciliation([{
      id: 'candidate', name: desired.name, syncType: 'clareza',
      cronExpression: '0 4 * * *', timezone: 'UTC', enabled: false,
    }], desired)).toEqual([{ kind: 'update-disabled', id: 'candidate', desired }])

    expect(planCoreScheduleReconciliation([
      { id: 'a', name: desired.name, syncType: 'clareza',
        cronExpression: desired.cronExpression, timezone: desired.timezone, enabled: false },
      { id: 'b', name: desired.name, syncType: 'clareza',
        cronExpression: desired.cronExpression, timezone: desired.timezone, enabled: false },
    ], desired)).toEqual([{ kind: 'conflict', ids: ['a', 'b'], reason: 'duplicate-canonical-schedules' }])
  })

  it('refuses to turn planning into scheduler activation', () => {
    expect(() => planCoreScheduleReconciliation([], { ...desired, enabled: true as false }))
      .toThrow('schedule candidate must remain disabled before rollout')
  })
})
