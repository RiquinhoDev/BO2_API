export type EnrollmentPlatform = 'hotmart' | 'curseduca' | 'discord'

export type EnrollmentStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'PARA_INATIVAR'

export type ProgressLevel =
  | 'MUITO_BAIXO'
  | 'BAIXO'
  | 'MEDIO'
  | 'ALTO'
  | 'MUITO_ALTO'

export type EngagementLevel = 'NONE' | ProgressLevel

export interface UsersV2EnrollmentFilters {
  page: number
  limit: number
  platform?: EnrollmentPlatform
  productId?: string
  status?: EnrollmentStatus
  search?: string
  progressLevel?: ProgressLevel
  engagementLevel?: EngagementLevel[]
  minEngagement?: number
  maxEngagement?: number
  lastAccessBefore?: string
  enrolledAfter?: string
}

export interface UsersV2EnrollmentRow {
  _id: unknown
  userId: {
    _id: unknown
    name: unknown
    email: unknown
    averageEngagement: number
    averageEngagementLevel: EngagementLevel
  }
  productId: unknown
  platform: EnrollmentPlatform
  status: EnrollmentStatus
  enrolledAt: unknown
  isPrimary: boolean
  progress: {
    percentage: number
    progressPercentage: number
    lastActivity?: unknown
  }
  engagement: {
    score: number
    level: EngagementLevel
    lastAction?: unknown
  }
  averageEngagement: number
  averageEngagementLevel: EngagementLevel
}

export interface UsersV2EnrollmentReader {
  read(filters: UsersV2EnrollmentFilters): Promise<{
    totalUsers: number
    rows: UsersV2EnrollmentRow[]
  }>
}
