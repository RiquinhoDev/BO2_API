import { type IUser } from '../../models/user'
import { type GuruSubscription } from '../guru/guruSync.service'

export type CurseducaDetails = NonNullable<IUser['curseduca']>

export interface ClarezaComparisonData {
  userEmail: string
  userName?: string
  status: string
  curseducaUserId?: string | null
  platformUserId?: string
  enrolledClasses?: CurseducaDetails['enrolledClasses']
  updatedAt?: Date
  enrolledAt?: Date
  source?: string
}

export interface ComparisonRecord {
  email: string
  name?: string
  guruStatus?: string | null
  guruEffective?: string
  guruUpdatedAt?: Date
  clarezaStatus?: string | null
  clarezaUpdatedAt?: Date
  clarezaEnrolledAt?: Date
  clarezaSource?: string
  verified?: boolean
}

export interface CurseducaMemberResponse {
  situation?: string
  data?: { situation?: string }
}

export interface SubscriptionCandidate {
  code: string
  status: string
  startedAt: string
  sub: GuruSubscription
}

export interface MultiSubscriptionUser {
  email: string
  subscriptions: Array<{ code: string; status: string; startedAt: string }>
  bestStatus: string
  bestCode: string
}

export interface ProblemUser {
  email: string
  currentStatus: string
  shouldBe: string
  bestSubscriptionCode: string
  allSubscriptions: string[]
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
