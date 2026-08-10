import User from '../../models/user'
import type { ProductMemberRecord, UserProductStatsReader } from './userProductStats.service'

/**
 * Owns the Mongoose read for product membership stats, moved verbatim from the
 * legacy handler: the same non-deleted scope and projection.
 */
export class MongooseUserProductStatsReader implements UserProductStatsReader {
  async listMembers(): Promise<ProductMemberRecord[]> {
    return User.find(
      {
        $or: [
          { isDeleted: { $exists: false } },
          { isDeleted: false },
        ],
      },
      {
        _id: 1,
        className: 1,
        hotmartUserId: 1,
        curseducaUserId: 1,
        status: 1,
        estado: 1,
      },
    ).lean<ProductMemberRecord[]>()
  }
}
