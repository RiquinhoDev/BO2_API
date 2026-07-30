import { Types, type PipelineStage } from 'mongoose'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type {
  EngagementLevel,
  EnrollmentPlatform,
  EnrollmentStatus,
  ProgressLevel,
  UsersV2EnrollmentFilters,
  UsersV2EnrollmentReader,
  UsersV2EnrollmentRow,
} from './usersV2Enrollment.contract'
import {
  engagementLevelFromScore,
  engagementRangeFor,
  type MongoNumericRange,
} from './usersV2Enrollment.domain'

interface EnrollmentAggregationRow {
  _id: unknown
  userId: {
    _id: unknown
    name: unknown
    email: unknown
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
    lastAction?: unknown
  }
  averageEngagement: number
}

interface EnrollmentAggregationResult {
  totalUsers: number
  rows: EnrollmentAggregationRow[]
}

interface EnrollmentCollections {
  users: string
  products: string
}

const progressRanges: Record<ProgressLevel, MongoNumericRange> = {
  MUITO_BAIXO: { minInclusive: 0, maxExclusive: 25 },
  BAIXO: { minInclusive: 25, maxExclusive: 40 },
  MEDIO: { minInclusive: 40, maxExclusive: 60 },
  ALTO: { minInclusive: 60, maxExclusive: 80 },
  MUITO_ALTO: { minInclusive: 80, maxInclusive: 100 },
}

export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const numericRange = (
  path: string,
  range: MongoNumericRange,
): Record<string, unknown> => {
  const bounds: Record<string, number> = {}

  if (range.minExclusive !== undefined) bounds.$gt = range.minExclusive
  if (range.minInclusive !== undefined) bounds.$gte = range.minInclusive
  if (range.maxExclusive !== undefined) bounds.$lt = range.maxExclusive
  if (range.maxInclusive !== undefined) bounds.$lte = range.maxInclusive

  return { [path]: bounds }
}

const finiteDoubleOrZero = (path: string): Record<string, unknown> => ({
  $let: {
    vars: {
      converted: {
        $cond: [
          { $isNumber: path },
          {
            $convert: {
              input: path,
              to: 'double',
              onError: null,
              onNull: null,
            },
          },
          null,
        ],
      },
    },
    in: {
      $cond: [
        {
          $and: [
            { $ne: ['$$converted', null] },
            { $gte: ['$$converted', -Number.MAX_VALUE] },
            { $lte: ['$$converted', Number.MAX_VALUE] },
          ],
        },
        '$$converted',
        0,
      ],
    },
  },
})

const buildEnrollmentMatch = (
  filters: UsersV2EnrollmentFilters,
): Record<string, unknown> => {
  const conditions: Record<string, unknown>[] = []

  if (filters.platform !== undefined) {
    conditions.push({ platform: filters.platform })
  }
  if (filters.productId !== undefined) {
    conditions.push({ productId: new Types.ObjectId(filters.productId) })
  }
  if (filters.status !== undefined) {
    conditions.push({ status: filters.status })
  }
  if (filters.progressLevel !== undefined) {
    conditions.push(numericRange(
      'progress.percentage',
      progressRanges[filters.progressLevel],
    ))
  }
  if (filters.engagementLevel !== undefined) {
    const ranges = engagementRangeFor(filters.engagementLevel)
    conditions.push({
      $or: ranges.map(range =>
        numericRange('engagement.engagementScore', range)),
    })
  }
  if (
    filters.minEngagement !== undefined
    || filters.maxEngagement !== undefined
  ) {
    conditions.push(numericRange('engagement.engagementScore', {
      minInclusive: filters.minEngagement,
      maxInclusive: filters.maxEngagement,
    }))
  }
  if (filters.lastAccessBefore !== undefined) {
    const cutoff = new Date(filters.lastAccessBefore)
    conditions.push({
      $or: [
        { 'engagement.lastAction': { $exists: false } },
        { 'engagement.lastAction': null },
        { 'engagement.lastAction': { $lt: cutoff } },
      ],
    })
  }
  if (filters.enrolledAfter !== undefined) {
    conditions.push({
      enrolledAt: { $gte: new Date(filters.enrolledAfter) },
    })
  }

  if (conditions.length === 0) return {}
  if (conditions.length === 1) return conditions[0] ?? {}
  return { $and: conditions }
}

const buildUserLookupPipeline = (
  filters: UsersV2EnrollmentFilters,
): Exclude<
  PipelineStage,
  PipelineStage.Merge | PipelineStage.Out
>[] => {
  const match: Record<string, unknown> = {
    isDeleted: { $ne: true },
  }

  if (filters.status === 'ACTIVE') {
    match['combined.status'] = 'ACTIVE'
  }

  return [
    { $match: match },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        'combined.status': 1,
      },
    },
  ]
}

const userSearchStage = (
  search: string | undefined,
): PipelineStage[] => {
  if (search === undefined) return []
  const escaped = escapeRegExpLiteral(search)

  return [{
    $match: {
      $or: [
        { 'user.name': { $regex: escaped, $options: 'i' } },
        { 'user.email': { $regex: escaped, $options: 'i' } },
      ],
    },
  }]
}

export function buildUsersV2EnrollmentPipeline(
  filters: UsersV2EnrollmentFilters,
  collections: EnrollmentCollections,
): PipelineStage[] {
  const skip = (filters.page - 1) * filters.limit

  return [
    { $match: buildEnrollmentMatch(filters) },
    {
      $lookup: {
        from: collections.users,
        localField: 'userId',
        foreignField: '_id',
        pipeline: buildUserLookupPipeline(filters),
        as: 'user',
      },
    },
    { $unwind: '$user' },
    ...userSearchStage(filters.search),
    {
      $set: {
        normalizedEngagement: finiteDoubleOrZero(
          '$engagement.engagementScore',
        ),
        normalizedProgress: finiteDoubleOrZero('$progress.percentage'),
      },
    },
    { $sort: { userId: 1, _id: 1 } },
    {
      $group: {
        _id: '$userId',
        user: { $first: '$user' },
        rows: {
          $push: {
            _id: '$_id',
            productId: '$productId',
            platform: '$platform',
            status: '$status',
            enrolledAt: '$enrolledAt',
            isPrimary: { $ifNull: ['$isPrimary', false] },
            progress: {
              percentage: '$normalizedProgress',
              progressPercentage: '$normalizedProgress',
              lastActivity: '$progress.lastActivity',
            },
            engagement: {
              score: '$normalizedEngagement',
              lastAction: '$engagement.lastAction',
            },
          },
        },
        averageEngagement: { $avg: '$normalizedEngagement' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $facet: {
        total: [{ $count: 'count' }],
        page: [
          { $skip: skip },
          { $limit: filters.limit },
        ],
      },
    },
    {
      $set: {
        totalUsers: {
          $ifNull: [
            { $arrayElemAt: ['$total.count', 0] },
            0,
          ],
        },
      },
    },
    {
      $unwind: {
        path: '$page',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: '$page.rows',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: collections.products,
        localField: 'page.rows.productId',
        foreignField: '_id',
        pipeline: [{
          $project: {
            _id: 1,
            name: 1,
            code: 1,
            platform: 1,
          },
        }],
        as: 'product',
      },
    },
    {
      $set: {
        resultRow: {
          $cond: [
            { $eq: [{ $type: '$page.rows._id' }, 'missing'] },
            null,
            {
              _id: '$page.rows._id',
              userId: {
                _id: '$page.user._id',
                name: '$page.user.name',
                email: '$page.user.email',
                averageEngagement: '$page.averageEngagement',
              },
              productId: {
                $ifNull: [
                  { $arrayElemAt: ['$product', 0] },
                  '$page.rows.productId',
                ],
              },
              platform: '$page.rows.platform',
              status: '$page.rows.status',
              enrolledAt: '$page.rows.enrolledAt',
              isPrimary: '$page.rows.isPrimary',
              progress: '$page.rows.progress',
              engagement: '$page.rows.engagement',
              averageEngagement: '$page.averageEngagement',
            },
          ],
        },
      },
    },
    { $sort: { 'page._id': 1, 'page.rows._id': 1 } },
    {
      $group: {
        _id: null,
        totalUsers: { $first: '$totalUsers' },
        rows: { $push: '$resultRow' },
      },
    },
    {
      $project: {
        _id: 0,
        totalUsers: 1,
        rows: {
          $filter: {
            input: '$rows',
            as: 'row',
            cond: { $ne: ['$$row', null] },
          },
        },
      },
    },
  ]
}

const withEngagementLevels = (
  row: EnrollmentAggregationRow,
): UsersV2EnrollmentRow => {
  const averageEngagement = Math.round(row.averageEngagement)
  const averageEngagementLevel: EngagementLevel =
    engagementLevelFromScore(averageEngagement)

  return {
    ...row,
    averageEngagement,
    userId: {
      ...row.userId,
      averageEngagement,
      averageEngagementLevel,
    },
    engagement: {
      ...row.engagement,
      level: engagementLevelFromScore(row.engagement.score),
    },
    averageEngagementLevel,
  }
}

export class MongooseUsersV2EnrollmentReader
implements UsersV2EnrollmentReader {
  async read(filters: UsersV2EnrollmentFilters): Promise<{
    totalUsers: number
    rows: UsersV2EnrollmentRow[]
  }> {
    const pipeline = buildUsersV2EnrollmentPipeline(filters, {
      users: User.collection.name,
      products: Product.collection.name,
    })
    const results = await UserProduct.aggregate<EnrollmentAggregationResult>(
      pipeline,
    )
      .option({ maxTimeMS: 120_000, allowDiskUse: false })
      .exec()
    const result = results[0]

    if (result === undefined) {
      return { totalUsers: 0, rows: [] }
    }

    return {
      totalUsers: result.totalUsers,
      rows: result.rows.map(withEngagementLevels),
    }
  }
}
