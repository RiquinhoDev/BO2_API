import type mongoose from 'mongoose'
import User from '../../models/user'
import type {
  UserListCriteria,
  UserListPage,
  UserListPagination,
  UserListReader,
} from './userList.contract'

type PipelineStage = mongoose.PipelineStage
type MongoFilter = Record<string, unknown>

/**
 * Composes independent filters without allowing one `$or` predicate to erase
 * another. Single-predicate queries keep their previous top-level shape; only
 * combinations require `$and`.
 */
function buildMatch(criteria: UserListCriteria): MongoFilter {
  const matchStage: MongoFilter = {}
  const predicates: MongoFilter[] = []

  if (criteria.search) {
    predicates.push({
      $or: [
        { name: { $regex: criteria.search, $options: 'i' } },
        { email: { $regex: criteria.search, $options: 'i' } },
        { username: { $regex: criteria.search, $options: 'i' } },
      ],
    })
  }

  if (criteria.status) {
    matchStage.status = criteria.status
  }

  if (criteria.hasDiscord === 'true') {
    matchStage.discordIds = { $exists: true, $not: { $size: 0 } }
  } else if (criteria.hasDiscord === 'false') {
    predicates.push({
      $or: [
        { discordIds: { $exists: false } },
        { discordIds: { $size: 0 } },
      ],
    })
  }

  if (criteria.hasHotmart === 'true') {
    predicates.push({
      $or: [
        {
          $and: [
            { classId: { $exists: true } },
            { classId: { $ne: null } },
            { classId: { $ne: '' } },
          ],
        },
        {
          $and: [
            { hotmartUserId: { $exists: true } },
            { hotmartUserId: { $ne: null } },
            { hotmartUserId: { $ne: '' } },
          ],
        },
      ],
    })
  } else if (criteria.hasHotmart === 'false') {
    predicates.push({
      $or: [
        { classId: { $exists: false } },
        { classId: null },
        { classId: '' },
      ],
    })
    predicates.push({
      $or: [
        { hotmartUserId: { $exists: false } },
        { hotmartUserId: null },
        { hotmartUserId: '' },
      ],
    })
  }

  if (predicates.length === 1) {
    Object.assign(matchStage, predicates[0])
  } else if (predicates.length > 1) {
    matchStage.$and = predicates
  }

  return matchStage
}

function buildPipeline(
  matchStage: MongoFilter,
  { skip, limit }: UserListPagination,
): PipelineStage[] {
  return [
    { $match: matchStage },
    {
      $lookup: {
        from: 'classes',
        localField: 'classId',
        foreignField: 'classId',
        as: 'classInfo',
      },
    },
    { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        discordIds: 1,
        username: 1,
        email: 1,
        name: 1,
        classId: 1,
        className: '$classInfo.name',
        status: 1,
        purchaseDate: 1,
        role: 1,
        engagement: 1,
        type: 1,
        lastAccessDate: 1,
        hotmartUserId: 1,
        progress: 1,
        hasDiscordIds: {
          $gt: [{ $size: { $ifNull: ['$discordIds', []] } }, 0],
        },
        hasHotmartConnection: {
          $or: [
            { $and: [{ $ne: ['$classId', null] }, { $ne: ['$classId', ''] }] },
            { $and: [{ $ne: ['$hotmartUserId', null] }, { $ne: ['$hotmartUserId', ''] }] },
          ],
        },
        hasProgress: {
          $gt: [{ $ifNull: ['$progress.completedPercentage', 0] }, 0],
        },
      },
    },
    { $sort: { name: 1 } },
    { $skip: skip },
    { $limit: limit },
  ]
}

export class MongooseUserListReader implements UserListReader {
  async listAndCount(
    criteria: UserListCriteria,
    pagination: UserListPagination,
  ): Promise<UserListPage> {
    const matchStage = buildMatch(criteria)

    const [rows, countResult] = await Promise.all([
      User.aggregate(buildPipeline(matchStage, pagination)),
      User.aggregate([{ $match: matchStage }, { $count: 'total' }]),
    ])

    return { rows, total: countResult[0]?.total || 0 }
  }
}
