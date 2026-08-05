import User from '../../models/user'
import type { ListingStats, UserListingStatsReader } from './userListingStats.service'

/**
 * Owns the Mongoose aggregation for the listing summary, moved verbatim from
 * the legacy handler. withEngagement counts every non-deleted document because
 * a missing engagementScore still satisfies the $ne null test; correcting that
 * is separate work.
 */
export class MongooseUserListingStatsReader implements UserListingStatsReader {
  async read(): Promise<ListingStats | null> {
    const stats = await User.aggregate<ListingStats>([
      {
        $match: {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$status', 'ACTIVE'] },
                    { $in: ['$estado', ['ativo', 'active']] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          withEngagement: {
            $sum: {
              $cond: [
                { $ne: ['$engagementScore', null] },
                1,
                0,
              ],
            },
          },
          withProgress: {
            $sum: {
              $cond: [
                { $gt: ['$progress.completedPercentage', 0] },
                1,
                0,
              ],
            },
          },
        },
      },
    ])

    return stats[0] ?? null
  }
}
