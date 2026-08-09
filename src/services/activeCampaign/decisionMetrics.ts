import type { DecisionMetrics } from './decisionContextTypes'

export type DecisionEngagement = {
  daysSinceLastLogin?: number | null
  daysSinceLastAction?: number | null
  daysSinceEnrollment?: number
  engagementScore?: number
  totalLogins?: number
}

export type DecisionMetricsInput = { engagement?: DecisionEngagement }

export interface DecisionMetricsDependencies {
  now: Date
  getLastActivity(): Date | null
}

function daysSince(lastActivity: Date | null, now: Date): number | null {
  if (!lastActivity) return null
  const milliseconds = now.getTime() - lastActivity.getTime()
  return Math.max(0, Math.floor(milliseconds / (1000 * 60 * 60 * 24)))
}

export function calculateDecisionMetrics(
  input: DecisionMetricsInput,
  dependencies: DecisionMetricsDependencies
): DecisionMetrics {
  const fallbackDays = daysSince(dependencies.getLastActivity(), dependencies.now)
  const engagement = input.engagement

  return {
    daysSinceLastLogin: engagement?.daysSinceLastLogin ?? fallbackDays,
    daysSinceLastAction: engagement?.daysSinceLastAction ?? fallbackDays,
    daysSinceEnrollment: engagement?.daysSinceEnrollment ?? 999,
    engagementScore: engagement?.engagementScore ?? 0,
    totalLogins: engagement?.totalLogins ?? 0,
    totalActions: 0
  }
}
