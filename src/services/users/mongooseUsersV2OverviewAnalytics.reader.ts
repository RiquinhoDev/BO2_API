import type { PipelineStage } from 'mongoose'
import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type {
  UsersV2OverviewAnalyticsReader,
  UsersV2OverviewAnalyticsSnapshot,
} from './usersV2OverviewAnalytics.service'

interface AnalyticsCollections {
  users: string
  products: string
}

const finiteDoubleOrNull = (path: string): Record<string, unknown> => ({
  $let: {
    vars: {
      converted: {
        $convert: {
          input: path,
          to: 'double',
          onError: null,
          onNull: null,
        },
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
        null,
      ],
    },
  },
})

export function buildUsersV2OverviewAnalyticsPipeline(
  collections: AnalyticsCollections,
): PipelineStage[] {
  return [
    {
      $project: {
        _id: 0,
        userId: 1,
        productId: 1,
        platform: 1,
        status: 1,
        'progress.percentage': 1,
      },
    },
    {
      $lookup: {
        from: collections.users,
        let: { userId: '$userId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$userId'] },
              isDeleted: { $ne: true },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $lookup: {
        from: collections.products,
        let: { productId: '$productId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$productId'] },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              platform: 1,
            },
          },
        ],
        as: 'product',
      },
    },
    {
      $set: {
        product: { $arrayElemAt: ['$product', 0] },
        normalizedPlatform: { $ifNull: ['$platform', 'unknown'] },
        numericProgress: finiteDoubleOrNull('$progress.percentage'),
      },
    },
    {
      $set: {
        clampedProgress: {
          $cond: [
            { $eq: ['$numericProgress', null] },
            null,
            {
              $min: [
                100,
                { $max: [0, '$numericProgress'] },
              ],
            },
          ],
        },
      },
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: '$userId',
              hasActive: {
                $max: {
                  $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0],
                },
              },
              progressSum: {
                $sum: { $ifNull: ['$numericProgress', 0] },
              },
              progressCount: {
                $sum: {
                  $cond: [{ $ne: ['$numericProgress', null] }, 1, 0],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              hasActive: 1,
              averageProgress: {
                $cond: [
                  { $eq: ['$progressCount', 0] },
                  0,
                  { $divide: ['$progressSum', '$progressCount'] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              totalActiveUsers: { $sum: '$hasActive' },
              userProgressSum: { $sum: '$averageProgress' },
              userProgressCount: { $sum: 1 },
            },
          },
        ],
        platforms: [
          {
            $group: {
              _id: {
                platform: '$normalizedPlatform',
                userId: '$userId',
              },
            },
          },
          {
            $group: {
              _id: '$_id.platform',
              userCount: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              platform: '$_id',
              userCount: 1,
            },
          },
          { $sort: { userCount: -1, platform: 1 } },
        ],
        products: [
          { $match: { 'product._id': { $exists: true } } },
          {
            $group: {
              _id: {
                productId: '$product._id',
                userId: '$userId',
              },
              productName: {
                $first: {
                  $ifNull: [
                    '$product.name',
                    { $toString: '$product._id' },
                  ],
                },
              },
              platform: {
                $min: {
                  $ifNull: ['$product.platform', '$normalizedPlatform'],
                },
              },
              hasActive: {
                $max: {
                  $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0],
                },
              },
              progressSum: {
                $sum: { $ifNull: ['$clampedProgress', 0] },
              },
              progressCount: {
                $sum: {
                  $cond: [{ $ne: ['$clampedProgress', null] }, 1, 0],
                },
              },
            },
          },
          {
            $group: {
              _id: '$_id.productId',
              productName: { $first: '$productName' },
              platform: { $min: '$platform' },
              totalUsers: { $sum: 1 },
              activeUsers: { $sum: '$hasActive' },
              progressSum: { $sum: '$progressSum' },
              progressCount: { $sum: '$progressCount' },
            },
          },
          {
            $project: {
              _id: 0,
              productId: { $toString: '$_id' },
              productName: 1,
              platform: 1,
              totalUsers: 1,
              activeUsers: 1,
              progressSum: 1,
              progressCount: 1,
            },
          },
          { $sort: { totalUsers: -1, productId: 1 } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        overview: {
          $let: {
            vars: {
              aggregated: { $arrayElemAt: ['$overview', 0] },
            },
            in: {
              totalUsers: {
                $ifNull: ['$$aggregated.totalUsers', 0],
              },
              totalActiveUsers: {
                $ifNull: ['$$aggregated.totalActiveUsers', 0],
              },
              totalProducts: { $size: '$products' },
              userProgressSum: {
                $ifNull: ['$$aggregated.userProgressSum', 0],
              },
              userProgressCount: {
                $ifNull: ['$$aggregated.userProgressCount', 0],
              },
            },
          },
        },
        byPlatform: '$platforms',
        byProduct: '$products',
      },
    },
  ]
}

const zeroSnapshot = (): UsersV2OverviewAnalyticsSnapshot => ({
  overview: {
    totalUsers: 0,
    totalActiveUsers: 0,
    totalProducts: 0,
    userProgressSum: 0,
    userProgressCount: 0,
  },
  byPlatform: [],
  byProduct: [],
})

export class MongooseUsersV2OverviewAnalyticsReader
implements UsersV2OverviewAnalyticsReader {
  async read(): Promise<UsersV2OverviewAnalyticsSnapshot> {
    const results = await UserProduct.aggregate<UsersV2OverviewAnalyticsSnapshot>(
      buildUsersV2OverviewAnalyticsPipeline({
        users: User.collection.name,
        products: Product.collection.name,
      }),
    )
      .option({ maxTimeMS: 120_000, allowDiskUse: false })
      .exec()

    return results[0] ?? zeroSnapshot()
  }
}
