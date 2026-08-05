import type mongoose from 'mongoose'
import type { IProduct } from '../../models/product/Product'
import type { IUser } from '../../models/user'
import type { IUserProduct } from '../../models/UserProduct'

/** The five accepted criteria; at least one must be present. */
export interface StudentSearchCriteria {
  email?: string
  name?: string
  discordId?: string
  hotmartUserId?: string
  curseducaUserId?: string
}

export const STUDENT_SEARCH_CRITERIA = [
  'email',
  'name',
  'discordId',
  'hotmartUserId',
  'curseducaUserId',
] as const

/** Longest accepted value for any single criterion, after trimming. */
export const MAX_CRITERION_LENGTH = 256

/** Most students ever returned in one response. */
export const MAX_SEARCH_RESULTS = 200

/**
 * One row beyond the cap is read so truncation can be detected without a
 * second count query over the same regex.
 */
export const SEARCH_FETCH_LIMIT = MAX_SEARCH_RESULTS + 1

export type ProductSummary = Pick<IProduct, '_id' | 'name' | 'code' | 'platform'>

export interface UserProductRecord {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  platform: IUserProduct['platform']
  status: IUserProduct['status']
  enrolledAt: Date
  isPrimary: boolean
  progress?: IUserProduct['progress']
  engagement?: IUserProduct['engagement']
  activeCampaignData?: IUserProduct['activeCampaignData']
}

export interface PopulatedUserProductRecord extends Omit<UserProductRecord, 'productId'> {
  productId: ProductSummary
}

export type UserTransformSource = Pick<
  IUser,
  | '_id'
  | 'email'
  | 'name'
  | 'discord'
  | 'hotmart'
  | 'curseduca'
  | 'combined'
  | 'metadata'
  | 'communicationByCourse'
> & {
  username?: string
  deletedAt?: Date
  deletedBy?: string
  tags?: string[]
  notes?: string
  source?: string
  type?: string
}

export interface FrontendClass {
  classId: string
  className: string
  source: IUserProduct['platform']
  isActive: boolean
  enrolledAt?: Date
  role?: string
}

export interface ActiveCampaignTagsView {
  productCode: string
  productName: string
  tags: string[]
  lastSyncAt?: Date
}

export interface StudentSearchReader {
  /**
   * Builds the Mongo filter from the criteria and runs the query, bounded by
   * `limit`. Every term is matched literally: metacharacters are escaped, so no
   * caller-supplied pattern can be executed as a regular expression.
   */
  findStudents(
    criteria: StudentSearchCriteria,
    limit: number,
  ): Promise<UserTransformSource[]>
  findProducts(userIds: unknown[]): Promise<PopulatedUserProductRecord[]>
}

export interface StudentSearchOutcome<T> {
  students: T[]
  /** True when the query found more rows than the response is allowed to carry. */
  truncated: boolean
}
