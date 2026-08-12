import type { IStudentEngagementState } from '../../models/StudentEngagementState'
import type { IUserProduct } from '../../models/UserProduct'

export interface StudentStatsUser {
  createdAt?: Date
  metadata: { createdAt: Date }
  discord?: unknown
}

type StudentProductBase = Pick<
  IUserProduct,
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

export type StudentProductData = StudentProductBase & {
  productId: IUserProduct['productId'] | {
    _id?: IUserProduct['productId']
    code?: string
    name?: string
  }
  expiresAt?: Date | null
}

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
