export interface SnapshotActivityMetrics {
  hadLogin: boolean
  hadActivity: boolean
  loginCount: number
  activityCount: number
}

export function normalizeSnapshotMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

export function calculateSnapshotEngagementScore(activity: SnapshotActivityMetrics): number {
  let score = 0
  if (activity.hadLogin) score += 20
  if (activity.hadActivity) score += 30
  score += Math.min(activity.loginCount * 2, 20)
  score += Math.min(activity.activityCount * 3, 30)
  return Math.min(score, 100)
}
