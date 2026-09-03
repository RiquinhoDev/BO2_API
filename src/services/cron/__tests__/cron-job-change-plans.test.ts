import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planDisableTagRulesSync, planRenameProductionJobs } from '../../../../scripts/cron-job-change-plans'

describe('cron job change plans', () => {
  it('plans only the isActive change for TAG_RULES_SYNC and is idempotent once disabled', () => {
    const active = { _id: 'legacy-1', name: 'TAG_RULES_SYNC', isActive: true, cronExpression: '0 2 * * *' }

    assert.deepStrictEqual(planDisableTagRulesSync([active]), {
      action: 'disable',
      before: active,
      after: { ...active, isActive: false },
      filter: { _id: 'legacy-1', name: 'TAG_RULES_SYNC', isActive: true },
      update: { $set: { isActive: false } },
    })

    const disabled = { ...active, isActive: false }
    assert.deepStrictEqual(planDisableTagRulesSync([disabled]), {
      action: 'already-disabled',
      before: disabled,
      after: disabled,
    })
  })

  it('rejects a missing, duplicated, or malformed TAG_RULES_SYNC state', () => {
    assert.throws(() => planDisableTagRulesSync([]), /exactamente um/)
    assert.throws(() => planDisableTagRulesSync([
      { _id: '1', name: 'TAG_RULES_SYNC', isActive: true },
      { _id: '2', name: 'TAG_RULES_SYNC', isActive: true },
    ]), /exactamente um/)
    assert.throws(() => planDisableTagRulesSync([
      { _id: '1', name: 'TAG_RULES_SYNC', isActive: 'true' as unknown as boolean },
    ]), /isActive/)
  })

  it('renames only the two requested production job names and is idempotent', () => {
    const curseduca = {
      _id: 'job-1', name: 'TEST_CURSEDUCA_4MIN', description: 'keep', syncType: 'curseduca',
      schedule: { cronExpression: '*/4 * * * *', enabled: true },
    }
    const hotmart = {
      _id: 'job-2', name: '1º', description: 'keep', syncType: 'hotmart',
      schedule: { cronExpression: '0 4 * * *', enabled: false },
    }

    assert.deepStrictEqual(planRenameProductionJobs([curseduca, hotmart]), [
      {
        action: 'rename',
        before: curseduca,
        after: { ...curseduca, name: 'CursEducaSync' },
        filter: { _id: 'job-1', name: 'TEST_CURSEDUCA_4MIN' },
        update: { $set: { name: 'CursEducaSync' } },
      },
      {
        action: 'rename',
        before: hotmart,
        after: { ...hotmart, name: 'HotmartSync' },
        filter: { _id: 'job-2', name: '1º' },
        update: { $set: { name: 'HotmartSync' } },
      },
    ])

    assert.deepStrictEqual(planRenameProductionJobs([
      { ...curseduca, name: 'CursEducaSync' },
      { ...hotmart, name: 'HotmartSync' },
    ]), [
      { action: 'already-renamed', before: { ...curseduca, name: 'CursEducaSync' }, after: { ...curseduca, name: 'CursEducaSync' } },
      { action: 'already-renamed', before: { ...hotmart, name: 'HotmartSync' }, after: { ...hotmart, name: 'HotmartSync' } },
    ])
  })

  it('rejects rename collisions and a state where neither name exists', () => {
    assert.throws(() => planRenameProductionJobs([
      { _id: 'old', name: 'TEST_CURSEDUCA_4MIN' },
      { _id: 'new', name: 'CursEducaSync' },
    ]), /colisão/)
    assert.throws(() => planRenameProductionJobs([]), /não encontrado/)
    assert.throws(() => planRenameProductionJobs([
      { _id: 'c', name: 'CursEducaSync' },
      { _id: 'a', name: '1º' },
      { _id: 'b', name: '1º' },
    ]), /duplicado/)
  })
})
