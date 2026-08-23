import { planDisableTagRulesSync } from '../../scripts/cron-job-change-plans'

describe('cron job change plans', () => {
  it('plans only the isActive change for TAG_RULES_SYNC and is idempotent once disabled', () => {
    const active = { _id: 'legacy-1', name: 'TAG_RULES_SYNC', isActive: true, cronExpression: '0 2 * * *' }

    expect(planDisableTagRulesSync([active])).toEqual({
      action: 'disable',
      before: active,
      after: { ...active, isActive: false },
      filter: { _id: 'legacy-1', name: 'TAG_RULES_SYNC', isActive: true },
      update: { $set: { isActive: false } },
    })

    const disabled = { ...active, isActive: false }
    expect(planDisableTagRulesSync([disabled])).toEqual({
      action: 'already-disabled',
      before: disabled,
      after: disabled,
    })
  })

  it('rejects a missing, duplicated, or malformed TAG_RULES_SYNC state', () => {
    expect(() => planDisableTagRulesSync([])).toThrow('exactamente um')
    expect(() => planDisableTagRulesSync([
      { _id: '1', name: 'TAG_RULES_SYNC', isActive: true },
      { _id: '2', name: 'TAG_RULES_SYNC', isActive: true },
    ])).toThrow('exactamente um')
    expect(() => planDisableTagRulesSync([
      { _id: '1', name: 'TAG_RULES_SYNC', isActive: 'true' as unknown as boolean },
    ])).toThrow('isActive')
  })
})
