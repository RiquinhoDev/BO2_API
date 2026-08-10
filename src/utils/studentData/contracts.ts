import type { IStudentEngagementState } from '../../models/StudentEngagementState'
import type { IUserProduct } from '../../models/UserProduct'

export interface StudentStatsUser {
  createdAt?: Date
  metadata: { createdAt: Date }
  discord?: unknown
}

export type StudentProductData = Pick<
  IUserProduct,
  | 'productId'
  | 'productCode'
  | 'productName'
  | 'platform'
  | 'enrolledAt'
  | 'status'
  | 'progress'
  | 'engagement'
  | 'classes'
  | 'isPrimary'
  | 'createdAt'
  | 'updatedAt'
>

export type StudentEngagementStateData = Pick<
  IStudentEngagementState,
  | 'productCode'
  | 'currentState'
  | 'daysSinceLastLogin'
  | 'currentLevel'
  | 'currentTagAC'
  | 'stats'
  | 'totalEmailsSent'
  | 'totalReturns'
>
