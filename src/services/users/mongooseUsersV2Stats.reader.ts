import type { PipelineStage } from 'mongoose'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type {
  UsersV2StatsReader,
  UsersV2StatsSnapshot,
} from './usersV2Analytics.service'

const dayMs = 24 * 60 * 60 * 1000

const finiteDoubleOrZero = (path: string) => ({
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

const emptySnapshot = (): UsersV2StatsSnapshot => ({
  totalStudents: 0,
  engagementSum: 0,
  progressSum: 0,
  atRiskCount: 0,
  inactive30d: 0,
  new7d: 0,
  activeProducts: 0,
  byPlatform: [],
})

export class MongooseUsersV2StatsReader implements UsersV2StatsReader {
  async read(now: Date): Promise<UsersV2StatsSnapshot> {
    const inactiveCutoff = new Date(now.getTime() - (30 * dayMs))
    const newCutoff = new Date(now.getTime() - (7 * dayMs))
    const pipeline: PipelineStage[] = [
      {
        $match: { status: 'ACTIVE' },
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          productId: 1,
          platform: 1,
          enrolledAt: 1,
          'engagement.engagementScore': 1,
          'progress.percentage': 1,
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$userId'] },
              },
            },
            {
              $project: {
                _id: 0,
                'discord.engagement.lastMessageDate': 1,
              },
            },
          ],
          as: 'user',
        },
      },
      {
        $set: {
          numericEngagement: finiteDoubleOrZero(
            '$engagement.engagementScore',
          ),
          numericProgress: finiteDoubleOrZero('$progress.percentage'),
          lastMessageDate: {
            $arrayElemAt: [
              '$user.discord.engagement.lastMessageDate',
              0,
            ],
          },
          normalizedPlatform: {
            $ifNull: ['$platform', 'unknown'],
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalStudents: { $sum: 1 },
                engagementSum: { $sum: '$numericEngagement' },
                progressSum: { $sum: '$numericProgress' },
                atRiskCount: {
                  $sum: {
                    $cond: [
                      { $lte: ['$numericEngagement', 30] },
                      1,
                      0,
                    ],
                  },
                },
                inactive30d: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $eq: [
                              { $type: '$lastMessageDate' },
                              'date',
                            ],
                          },
                          { $lt: ['$lastMessageDate', inactiveCutoff] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                new7d: {
                  $sum: {
                    $cond: [
                      { $gte: ['$enrolledAt', newCutoff] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          products: [
            {
              $group: {
                _id: '$productId',
              },
            },
          ],
          platforms: [
            {
              $group: {
                _id: '$normalizedPlatform',
                count: { $sum: 1 },
              },
            },
            {
              $sort: { _id: 1 },
            },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          totalStudents: {
            $ifNull: [
              { $arrayElemAt: ['$totals.totalStudents', 0] },
              0,
            ],
          },
          engagementSum: {
            $ifNull: [
              { $arrayElemAt: ['$totals.engagementSum', 0] },
              0,
            ],
          },
          progressSum: {
            $ifNull: [
              { $arrayElemAt: ['$totals.progressSum', 0] },
              0,
            ],
          },
          atRiskCount: {
            $ifNull: [
              { $arrayElemAt: ['$totals.atRiskCount', 0] },
              0,
            ],
          },
          inactive30d: {
            $ifNull: [
              { $arrayElemAt: ['$totals.inactive30d', 0] },
              0,
            ],
          },
          new7d: {
            $ifNull: [
              { $arrayElemAt: ['$totals.new7d', 0] },
              0,
            ],
          },
          activeProducts: { $size: '$products' },
          byPlatform: {
            $map: {
              input: '$platforms',
              as: 'platform',
              in: {
                platform: '$$platform._id',
                count: '$$platform.count',
              },
            },
          },
        },
      },
    ]
    const rows = await UserProduct.aggregate<UsersV2StatsSnapshot>(pipeline)
      .option({ maxTimeMS: 120_000 })
      .exec()

    return rows[0] ?? emptySnapshot()
  }
}
