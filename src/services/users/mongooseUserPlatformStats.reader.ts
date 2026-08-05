import User from '../../models/user'
import type {
  PlatformCounts,
  PlatformEngagement,
  UserPlatformStatsReader,
} from './userPlatformStats.service'

/**
 * Owns every Mongoose read for the platform stats, moved verbatim from the
 * legacy handler and run sequentially in the same order. totalUsers stays
 * unfiltered (it counts even soft-deleted users); correcting that is separate
 * work.
 */
export class MongooseUserPlatformStatsReader implements UserPlatformStatsReader {
  async read(): Promise<PlatformCounts> {
    const totalUsers = await User.countDocuments()

    const discordUsers = await User.countDocuments({
      $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } },
      ],
    })

    const hotmartUsers = await User.countDocuments({
      $or: [
        { $and: [{ classId: { $exists: true } }, { classId: { $ne: null } }, { classId: { $ne: '' } }] },
        { $and: [{ hotmartUserId: { $exists: true } }, { hotmartUserId: { $ne: null } }, { hotmartUserId: { $ne: '' } }] },
      ],
    })

    const curseducaUsers = await User.countDocuments({
      $or: [
        { $and: [{ curseducaUserId: { $exists: true } }, { curseducaUserId: { $ne: null } }, { curseducaUserId: { $ne: '' } }] },
        { $and: [{ 'curseduca.curseducaUserId': { $exists: true } }, { 'curseduca.curseducaUserId': { $ne: null } }, { 'curseduca.curseducaUserId': { $ne: '' } }] },
      ],
    })

    const multiPlatformUsers = await User.countDocuments({
      $and: [
        {
          $or: [
            { $and: [{ hotmartUserId: { $exists: true } }, { hotmartUserId: { $ne: null } }, { hotmartUserId: { $ne: '' } }] },
            { $and: [{ 'hotmart.hotmartUserId': { $exists: true } }, { 'hotmart.hotmartUserId': { $ne: null } }, { 'hotmart.hotmartUserId': { $ne: '' } }] },
          ],
        },
        {
          $or: [
            { $and: [{ curseducaUserId: { $exists: true } }, { curseducaUserId: { $ne: null } }, { curseducaUserId: { $ne: '' } }] },
            { $and: [{ 'curseduca.curseducaUserId': { $exists: true } }, { 'curseduca.curseducaUserId': { $ne: null } }, { 'curseduca.curseducaUserId': { $ne: '' } }] },
          ],
        },
      ],
    })

    const bothPlatforms = await User.countDocuments({
      $and: [
        { discordIds: { $exists: true, $not: { $size: 0 } } },
        {
          $or: [
            { $and: [{ classId: { $exists: true } }, { classId: { $ne: null } }, { classId: { $ne: '' } }] },
            { $and: [{ hotmartUserId: { $exists: true } }, { hotmartUserId: { $ne: null } }, { hotmartUserId: { $ne: '' } }] },
          ],
        },
      ],
    })

    const activeUsers = await User.countDocuments({
      $or: [
        { status: 'ACTIVE' },
        { estado: { $in: ['ativo', 'active'] } },
      ],
    })

    const inactiveUsers = await User.countDocuments({
      $nor: [
        { status: 'ACTIVE' },
        { estado: { $in: ['ativo', 'active'] } },
      ],
    })

    const engagementPipeline = await User.aggregate<PlatformEngagement & { totalUsers: number }>([
      {
        $project: {
          engagementScore: {
            $let: {
              vars: {
                accessScore: {
                  $cond: [
                    { $gte: [{ $ifNull: ['$accessCount', 0] }, 50] }, 100,
                    { $cond: [
                      { $gte: [{ $ifNull: ['$accessCount', 0] }, 20] }, 80,
                      { $cond: [
                        { $gte: [{ $ifNull: ['$accessCount', 0] }, 10] }, 60,
                        { $cond: [
                          { $gte: [{ $ifNull: ['$accessCount', 0] }, 5] }, 40,
                          { $cond: [
                            { $gte: [{ $ifNull: ['$accessCount', 0] }, 1] }, 20,
                            0,
                          ] },
                        ] },
                      ] },
                    ] },
                  ],
                },
                progressScore: {
                  $cond: [
                    { $gte: [{ $ifNull: ['$progress.completedPercentage', 0] }, 90] }, 100,
                    { $cond: [
                      { $gte: [{ $ifNull: ['$progress.completedPercentage', 0] }, 70] }, 80,
                      { $cond: [
                        { $gte: [{ $ifNull: ['$progress.completedPercentage', 0] }, 50] }, 60,
                        { $cond: [
                          { $gte: [{ $ifNull: ['$progress.completedPercentage', 0] }, 30] }, 40,
                          { $cond: [
                            { $gt: [{ $ifNull: ['$progress.completedPercentage', 0] }, 0] }, 20,
                            0,
                          ] },
                        ] },
                      ] },
                    ] },
                  ],
                },
                engagementScore: {
                  $switch: {
                    branches: [
                      { case: { $in: ['$engagement', ['MUITO_ALTO', 'ALTO']] }, then: 100 },
                      { case: { $in: ['$engagement', ['MEDIO']] }, then: 60 },
                      { case: { $in: ['$engagement', ['BAIXO']] }, then: 40 },
                      { case: { $in: ['$engagement', ['MUITO_BAIXO']] }, then: 20 },
                    ],
                    default: 0,
                  },
                },
              },
              in: {
                $round: [
                  {
                    $add: [
                      { $multiply: ['$$accessScore', 0.4] },
                      { $multiply: ['$$progressScore', 0.4] },
                      { $multiply: ['$$engagementScore', 0.2] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          averageScore: { $avg: '$engagementScore' },
          topPerformers: { $sum: { $cond: [{ $gte: ['$engagementScore', 60] }, 1, 0] } },
          needsAttention: { $sum: { $cond: [{ $lte: ['$engagementScore', 39] }, 1, 0] } },
        },
      },
    ])

    const engagementResults = engagementPipeline[0] ?? {
      averageScore: 0,
      topPerformers: 0,
      needsAttention: 0,
    }

    const usersWithEngagement = await User.countDocuments({
      $or: [
        { engagement: { $exists: true, $ne: null } },
        { accessCount: { $exists: true, $gt: 0 } },
        { 'progress.completedPercentage': { $exists: true, $gt: 0 } },
      ],
    })

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      hotmartUsers,
      curseducaUsers,
      discordUsers,
      multiPlatformUsers,
      bothPlatforms,
      usersWithEngagement,
      engagement: {
        averageScore: engagementResults.averageScore ?? 0,
        topPerformers: engagementResults.topPerformers ?? 0,
        needsAttention: engagementResults.needsAttention ?? 0,
      },
    }
  }
}
