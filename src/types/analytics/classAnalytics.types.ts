export type AlertType = 'warning' | 'info' | 'success'
export type AlertPriority = 'high' | 'medium' | 'low'
export interface ClassAnalyticsAlert { type: AlertType; message: string; priority: AlertPriority; category: string }
export interface EngagementDistribution { muito_alto: number; alto: number; medio: number; baixo: number; muito_baixo: number }
export interface ProgressDistribution { completed: number; advanced: number; intermediate: number; beginner: number; minimal: number }
export interface ActivityDistribution { very_active: number; active: number; moderate: number; low: number; inactive: number }
export interface LastAccessStats { today: number; week: number; month: number; older: number }
export interface HealthFactors { engagement: number; activity: number; progress: number; retention: number }
export interface IClassAnalytics {
  classId: string; className: string; totalStudents: number; activeStudents: number; inactiveStudents: number
  averageEngagement: number; engagementDistribution: EngagementDistribution; averageProgress: number
  progressDistribution: ProgressDistribution; averageAccessCount: number; activityDistribution: ActivityDistribution
  lastAccess: LastAccessStats; healthScore: number; healthFactors: HealthFactors; alerts: ClassAnalyticsAlert[]
  lastCalculatedAt: Date; calculationDuration: number; studentsProcessed: number; dataVersion: string
}
