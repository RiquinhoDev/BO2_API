import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type {
  PlatformCount,
  ProductCount,
  StatsOverviewReader,
} from './statsOverview.contract'

/**
 * Owns every Mongoose detail for the stats overview. The user count and the two
 * enrollment aggregations are moved verbatim from userProductService, so the
 * extraction changes no counting semantics: totalUsers is unfiltered (soft-deleted
 * users included), enrollments are counted regardless of status, and product-orphan
 * enrollments fall out of the `$unwind`. Correcting any of that is separate work.
 */
export class MongooseStatsOverviewReader implements StatsOverviewReader {
  countUsers(): Promise<number> {
    return User.countDocuments()
  }

  async countByPlatform(): Promise<PlatformCount[]> {
    return UserProduct.aggregate<PlatformCount>([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.platform',
          count: { $sum: 1 },
        },
      },
    ])
  }

  async countByProduct(): Promise<ProductCount[]> {
    return UserProduct.aggregate<ProductCount>([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product._id',
          productName: { $first: '$product.name' },
          count: { $sum: 1 },
        },
      },
    ])
  }
}
