import { evaluateDecisionCondition } from '../../../src/services/activeCampaign/decisionConditionEvaluator'

const values = {
  daysSinceLastLogin: 14,
  daysSinceLastAction: 9,
  daysSinceEnrollment: 30,
  currentProgress: 60,
  currentModule: 4,
  engagementScore: 35,
  totalLogins: 8,
  totalActions: 12
}

describe('decision condition evaluator', () => {
  it.each([
    ['daysInactive >= 14', true],
    ['daysInactive > 14', false],
    ['daysInactive < 15', true],
    ['daysSinceLastLogin === 14', true],
    ['lastAccessDate >= 9', true],
    ['daysSinceLastAction < 9', false],
    ['daysSinceEnrollment > 29', true],
    ['currentProgress === 60', true],
    ['currentModule >= 4', true],
    ['engagementScore < 40', true],
    ['engagementScore >= 40', false],
    ['totalLogins >= 8', true],
    ['totalActions >= 13', false]
  ])('evaluates %s as %s', (condition, expected) => {
    expect(evaluateDecisionCondition(condition, values)).toBe(expected)
  })

  it('preserves logical composition and current precedence', () => {
    expect(
      evaluateDecisionCondition(
        'daysSinceLastLogin >= 14 && currentProgress >= 60',
        values
      )
    ).toBe(true)
    expect(
      evaluateDecisionCondition(
        'daysSinceLastLogin < 14 || currentProgress >= 60',
        values
      )
    ).toBe(true)
    expect(
      evaluateDecisionCondition(
        'daysSinceLastLogin >= 14 || currentProgress < 60 && totalActions >= 13',
        values
      )
    ).toBe(false)
  })

  it('preserves the legacy fail-closed behavior for symbolic clauses wrapped in parentheses', () => {
    expect(
      evaluateDecisionCondition(
        '(daysSinceLastLogin >= 14) && (currentProgress >= 60)',
        values
      )
    ).toBe(false)
  })

  it('preserves the narrower legacy textual AND grammar', () => {
    expect(
      evaluateDecisionCondition(
        '(daysSinceLastLogin >= 14) AND (currentModule === 4)',
        values
      )
    ).toBe(true)
    expect(
      evaluateDecisionCondition(
        'prefix daysSinceLastLogin >= 14 AND currentModule === 4 suffix',
        values
      )
    ).toBe(true)
    expect(
      evaluateDecisionCondition(
        'engagementScore < 40 AND currentProgress >= 60',
        values
      )
    ).toBe(false)
  })

  it('uses the legacy defaults for absent metrics', () => {
    expect(
      evaluateDecisionCondition('daysSinceLastLogin >= 1', {
        ...values,
        daysSinceLastLogin: null
      })
    ).toBe(false)
    expect(
      evaluateDecisionCondition('daysSinceEnrollment >= 999', {
        ...values,
        daysSinceEnrollment: undefined
      })
    ).toBe(true)
  })

  it('fails closed and reports unknown leaf conditions', () => {
    const onUnknown = jest.fn()

    expect(evaluateDecisionCondition(undefined, values, onUnknown)).toBe(false)
    expect(evaluateDecisionCondition('arbitraryCode()', values, onUnknown)).toBe(false)
    expect(onUnknown).toHaveBeenCalledWith('arbitraryCode()')
  })
})
