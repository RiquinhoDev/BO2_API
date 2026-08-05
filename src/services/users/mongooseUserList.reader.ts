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
 * Builds the `$match` exactly as the legacy handler did, including the flaw
 * that `search`, `hasDiscord=false` and `hasHotmart=true` each assign `$or`
 * outright and therefore discard whichever filter ran before them. The
 * behaviour is pinned by tests named as bugs; fixing it is a separate slice,
 * because the Backoffice depends on the current results.
 */
function buildMatch(criteria: UserListCriteria): MongoFilter {
  const matchStage: MongoFilter = {}

  if (criteria.search) {
    matchStage.$or = [
      { name: { $regex: criteria.search, $options: 'i' } },
      { email: { $regex: criteria.search, $options: 'i' } },
      { username: { $regex: criteria.search, $options: 'i' } },
    ]
  }

  if (criteria.status) {
    matchStage.status = criteria.status
  }

  if (criteria.hasDiscord === 'true') {
    matchStage.discordIds = { $exists: true, $not: { $size: 0 } }
  } else if (criteria.hasDiscord === 'false') {
    matchStage.$or = [
      { discordIds: { $exists: false } },
      { discordIds: { $size: 0 } },
    ]
  }

  if (criteria.hasHotmart === 'true') {
    matchStage.$or = [
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
    ]
  } else if (criteria.hasHotmart === 'false') {
    matchStage.$and = [
      {
        $or: [
          { classId: { $exists: false } },
          { classId: null },
          { classId: '' },
        ],
      },
      {
        $or: [
          { hotmartUserId: { $exists: false } },
          { hotmartUserId: null },
          { hotmartUserId: '' },
        ],
      },
    ]
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
