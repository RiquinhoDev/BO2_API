export type DecisionConditionValues = {
  daysSinceLastLogin: number | null
  daysSinceLastAction: number | null
  daysSinceEnrollment?: number
  currentProgress?: number
  currentModule?: number
  engagementScore?: number
  totalLogins?: number
  totalActions?: number
}

export type DecisionMetricField =
  | 'daysInactive'
  | 'daysSinceLastLogin'
  | 'lastAccessDate'
  | 'daysSinceLastAction'
  | 'daysSinceEnrollment'
  | 'currentProgress'
  | 'currentModule'
  | 'engagementScore'
  | 'totalLogins'
  | 'totalActions'

export type DecisionMetricPredicateResult =
  | { recognized: true; value: boolean }
  | { recognized: false }
