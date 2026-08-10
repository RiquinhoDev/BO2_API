import {
  buildDecisionLevelPlan,
  splitDecisionRules
} from '../../../src/services/activeCampaign/decisionLevelPolicy'
import type {
  DecisionLevelInput,
  DecisionLevelRule
} from '../../../src/services/activeCampaign/decisionLevelTypes'

const now = new Date('2026-08-09T12:00:00.000Z')

const levelRules: DecisionLevelRule[] = [
  {
    rule: { _id: { toString: () => 'rule-1' }, name: 'Ten days', action: 'APPLY_TAG' },
    level: 1,
    daysInactive: 10,
    tagName: 'LEVEL_1'
  },
  {
    rule: { _id: { toString: () => 'rule-2' }, name: 'Twenty days', action: 'APPLY_TAG' },
    level: 2,
    daysInactive: 20,
    tagName: 'LEVEL_2',
    cooldownDays: 5
  }
]

describe('decision level policy', () => {
  it('splits level rules, parses thresholds and assigns missing levels in threshold order', () => {
    const regularRule = { name: 'Remove old', action: 'REMOVE_TAG' }
    const result = splitDecisionRules([
      { name: 'Twenty', action: 'APPLY_TAG', tagName: 'L20', condition: 'daysInactive >= 20' },
      regularRule,
      { name: 'Ten', action: 'APPLY_TAG', tag: 'L10', daysInactiveThreshold: 10 },
      { name: 'Explicit', action: 'APPLY_TAG', tagAC: 'L30', daysInactive: 30, level: 4 }
    ])

    expect(result.levelRules.map(rule => ({
      level: rule.level,
      daysInactive: rule.daysInactive,
      tagName: rule.tagName
    }))).toEqual([
      { level: 1, daysInactive: 10, tagName: 'L10' },
      { level: 2, daysInactive: 20, tagName: 'L20' },
      { level: 4, daysInactive: 30, tagName: 'L30' }
    ])
    expect(result.regularRules).toEqual([regularRule])
  })

  it('plans no transition when inactivity is unknown', () => {
    expect(buildDecisionLevelPlan(input({ daysInactive: null }))).toEqual({
      currentLevel: 0,
      appropriateLevel: 0,
      decisions: [],
      tagsToApply: [],
      tagsToRemove: [],
      transition: 'none'
    })
  })

  it('uses the stored level before inferring it from tags', () => {
    const result = buildDecisionLevelPlan(input({
      daysInactive: 12,
      storedCurrentLevel: 2,
      existingTags: ['LEVEL_1']
    }))

    expect(result.currentLevel).toBe(2)
    expect(result.appropriateLevel).toBe(1)
    expect(result.transition).toBe('none')
  })

  it('de-escalates on recent progress and plans a one-day cooldown', () => {
    const result = buildDecisionLevelPlan(input({
      daysInactive: 25,
      existingTags: ['LEVEL_1'],
      recentProgress: { type: 'user_action', value: 3 }
    }))

    expect(result.transition).toBe('recent-progress')
    expect(result.tagsToRemove).toEqual(['LEVEL_1', 'LEVEL_2'])
    expect(result.tagsToApply).toEqual([])
    expect(result.cooldownUntil).toEqual(new Date('2026-08-10T12:00:00.000Z'))
    expect(result.decisions).toEqual([expect.objectContaining({
      ruleName: 'Recent Progress',
      action: 'DESESCALATE',
      reason: 'Progresso recente detectado: user_action (3)'
    })])
  })

  it('removes level tags when an inactive learner returns active', () => {
    const result = buildDecisionLevelPlan(input({
      daysInactive: 0,
      existingTags: ['LEVEL_2']
    }))

    expect(result.transition).toBe('back-active')
    expect(result.tagsToRemove).toEqual(['LEVEL_1', 'LEVEL_2'])
    expect(result.cooldownUntil).toEqual(new Date('2026-08-10T12:00:00.000Z'))
    expect(result.decisions[0]).toEqual(expect.objectContaining({
      ruleName: 'Back Active',
      action: 'REMOVE_TAG'
    }))
  })

  it('plans an initial level with remove-before-apply tags and default cooldown', () => {
    const result = buildDecisionLevelPlan(input({ daysInactive: 12 }))

    expect(result.transition).toBe('escalate')
    expect(result.currentLevel).toBe(0)
    expect(result.appropriateLevel).toBe(1)
    expect(result.tagsToRemove).toEqual(['LEVEL_2'])
    expect(result.tagsToApply).toEqual(['LEVEL_1'])
    expect(result.cooldownUntil).toEqual(new Date('2026-08-12T12:00:00.000Z'))
    expect(result.decisions[0]).toEqual(expect.objectContaining({
      ruleId: 'rule-1',
      action: 'APPLY_TAG',
      confidence: 80
    }))
  })

  it('plans escalation with the target configured cooldown', () => {
    const result = buildDecisionLevelPlan(input({
      daysInactive: 25,
      existingTags: ['LEVEL_1']
    }))

    expect(result.transition).toBe('escalate')
    expect(result.tagsToRemove).toEqual(['LEVEL_1'])
    expect(result.tagsToApply).toEqual(['LEVEL_2'])
    expect(result.cooldownUntil).toEqual(new Date('2026-08-14T12:00:00.000Z'))
    expect(result.decisions[0]).toEqual(expect.objectContaining({ action: 'ESCALATE' }))
  })

  it('maintains the current level without planning cooldown', () => {
    const result = buildDecisionLevelPlan(input({
      daysInactive: 12,
      existingTags: ['LEVEL_1']
    }))

    expect(result.transition).toBe('maintain')
    expect(result.tagsToApply).toEqual(['LEVEL_1'])
    expect(result.tagsToRemove).toEqual(['LEVEL_2'])
    expect(result.cooldownUntil).toBeUndefined()
    expect(result.decisions[0]).toEqual(expect.objectContaining({
      ruleName: 'Maintain Level 1',
      action: 'NO_ACTION',
      shouldExecute: false
    }))
  })
})

function input(overrides: Partial<DecisionLevelInput> = {}): DecisionLevelInput {
  return {
    levelRules,
    daysInactive: 12,
    storedCurrentLevel: undefined,
    existingTags: [],
    recentProgress: null,
    now,
    defaultCooldownDays: 3,
    ...overrides
  }
}
