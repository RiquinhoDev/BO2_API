import type { DecisionConditionValues } from './decisionConditionTypes'
import {
  evaluateMetricPredicate,
  LEGACY_AND_FIELDS
} from './decisionMetricPredicates'

export type UnknownDecisionConditionHandler = (condition: string) => void

export function evaluateDecisionCondition(
  condition: string | undefined,
  values: DecisionConditionValues,
  onUnknown?: UnknownDecisionConditionHandler
): boolean {
  if (!condition) return false

  const trimmedCondition = condition.trim().replace(/^\(|\)$/g, '')

  if (trimmedCondition.includes('&&')) {
    return trimmedCondition
      .split('&&')
      .map(part => evaluateDecisionCondition(part.trim(), values, onUnknown))
      .every(Boolean)
  }

  if (trimmedCondition.includes('||')) {
    return trimmedCondition
      .split('||')
      .map(part => evaluateDecisionCondition(part.trim(), values, onUnknown))
      .some(Boolean)
  }

  if (/\sAND\s/i.test(condition)) {
    return condition
      .split(/\sAND\s/i)
      .map(part => part.trim().replace(/[()]/g, ''))
      .map(part => evaluateMetricPredicate(part, values, LEGACY_AND_FIELDS, false))
      .every(result => result.recognized && result.value)
  }

  const result = evaluateMetricPredicate(condition, values)
  if (result.recognized) return result.value

  onUnknown?.(condition)
  return false
}
