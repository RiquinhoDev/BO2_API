import type {
  DecisionConditionValues,
  DecisionMetricField,
  DecisionMetricPredicateResult
} from './decisionConditionTypes'

type ComparisonOperator = '>=' | '>' | '<' | '==='

const SIMPLE_OPERATORS: Readonly<Record<DecisionMetricField, readonly ComparisonOperator[]>> = {
  daysInactive: ['>=', '>', '<'],
  daysSinceLastLogin: ['>=', '>', '<', '==='],
  lastAccessDate: ['>=', '>', '<', '==='],
  daysSinceLastAction: ['>=', '>', '<', '==='],
  daysSinceEnrollment: ['>=', '>', '<', '==='],
  currentProgress: ['>=', '>', '<', '==='],
  currentModule: ['>=', '>', '<', '==='],
  engagementScore: ['>=', '<'],
  totalLogins: ['>='],
  totalActions: ['>=']
}

const FIELD_NAMES: readonly DecisionMetricField[] = [
  'daysInactive',
  'daysSinceLastLogin',
  'lastAccessDate',
  'daysSinceLastAction',
  'daysSinceEnrollment',
  'currentProgress',
  'currentModule',
  'engagementScore',
  'totalLogins',
  'totalActions'
]

export const LEGACY_AND_FIELDS: ReadonlySet<DecisionMetricField> = new Set([
  'daysSinceLastLogin',
  'lastAccessDate',
  'daysSinceLastAction',
  'daysSinceEnrollment',
  'currentProgress',
  'currentModule'
])

function resolveMetric(field: DecisionMetricField, values: DecisionConditionValues): number {
  switch (field) {
    case 'daysInactive':
    case 'daysSinceLastLogin':
      return values.daysSinceLastLogin ?? Number.NaN
    case 'lastAccessDate':
    case 'daysSinceLastAction':
      return values.daysSinceLastAction ?? Number.NaN
    case 'daysSinceEnrollment':
      return values.daysSinceEnrollment ?? 999
    case 'currentProgress':
      return values.currentProgress ?? 0
    case 'currentModule':
      return values.currentModule ?? 0
    case 'engagementScore':
      return values.engagementScore ?? 0
    case 'totalLogins':
      return values.totalLogins ?? 0
    case 'totalActions':
      return values.totalActions ?? 0
  }
}

function compare(actual: number, operator: ComparisonOperator, expected: number): boolean {
  switch (operator) {
    case '>=':
      return actual >= expected
    case '>':
      return actual > expected
    case '<':
      return actual < expected
    case '===':
      return actual === expected
  }
}

export function evaluateMetricPredicate(
  expression: string,
  values: DecisionConditionValues,
  allowedFields?: ReadonlySet<DecisionMetricField>,
  requireExactMatch: boolean = true
): DecisionMetricPredicateResult {
  const normalizedExpression = expression.trim()
  const match = normalizedExpression.match(
    /(daysInactive|daysSinceLastLogin|lastAccessDate|daysSinceLastAction|daysSinceEnrollment|currentProgress|currentModule|engagementScore|totalLogins|totalActions)\s*(===|>=|>|<)\s*(\d+)/i
  )
  if (!match || (requireExactMatch && match[0] !== normalizedExpression)) {
    return { recognized: false }
  }

  const field = FIELD_NAMES.find(
    candidate => candidate.toLowerCase() === match[1]?.toLowerCase()
  )
  const operator = field
    ? SIMPLE_OPERATORS[field].find(candidate => candidate === match[2])
    : undefined
  const expectedText = match[3]

  if (!field || !operator || expectedText === undefined) return { recognized: false }
  if (allowedFields && !allowedFields.has(field)) return { recognized: false }
  if (!SIMPLE_OPERATORS[field].includes(operator)) return { recognized: false }

  return {
    recognized: true,
    value: compare(resolveMetric(field, values), operator, Number(expectedText))
  }
}
