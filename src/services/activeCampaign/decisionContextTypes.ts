import type { IUser } from '../../models/user'
import type { IUserProduct } from '../../models/UserProduct'
import type { IProduct } from '../../models/product/Product'
import type { DecisionAction } from './decisionEngine.service'

export type EntityId = { toString(): string }

export type DecisionUserProduct = IUserProduct & {
  reengagement?: {
    cooldownUntil?: Date | string | number
    currentLevel?: number
  }
  cooldownUntil?: Date | string | number
  activeCampaignData?: IUserProduct['activeCampaignData'] & {
    cooldownUntil?: Date | string | number
  }
}

export type InternalRule = {
  _id?: EntityId
  name: string
  tagName?: string
  tag?: string
  tagAC?: string
  action: DecisionAction
  condition?: string
  priority?: number
  daysInactive?: number
  daysInactiveThreshold?: number
  level?: number
  cooldownDays?: number
}

export type DecisionMetrics = {
  daysSinceLastLogin: number | null
  daysSinceLastAction: number | null
  daysSinceEnrollment: number
  engagementScore: number
  totalLogins: number
  totalActions: number
}

export interface DecisionContext {
  userId: string
  productId: string
  userProduct: DecisionUserProduct
  user: IUser
  product: IProduct
  rules: InternalRule[]
}
