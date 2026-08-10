import User from '../../models/user'
import SyncHistory from '../../models/SyncHistory'
import type {
  DashboardCounts,
  DashboardEngagement,
  UserDashboardStatsReader,
} from './userDashboardStats.service'

interface SyncHistoryResult {
  completedAt: Date
}

const baseQuery = { isDeleted: { $ne: true } }

const hasHotmart = {
  $or: [
    { hotmartUserId: { $exists: true, $nin: [null, ''] } },
    { 'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] } },
  ],
}

const lacksHotmart = {
  $and: [
    { $or: [{ hotmartUserId: { $exists: false } }, { hotmartUserId: null }, { hotmartUserId: '' }] },
    { $or: [{ 'hotmart.hotmartUserId': { $exists: false } }, { 'hotmart.hotmartUserId': null }, { 'hotmart.hotmartUserId': '' }] },
  ],
}

const hasCurseduca = {
  $or: [
    { curseducaUserId: { $exists: true, $nin: [null, ''] } },
    { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
  ],
}

const lacksCurseduca = {
  $and: [
    { $or: [{ curseducaUserId: { $exists: false } }, { curseducaUserId: null }, { curseducaUserId: '' }] },
    { $or: [{ 'curseduca.curseducaUserId': { $exists: false } }, { 'curseduca.curseducaUserId': null }, { 'curseduca.curseducaUserId': '' }] },
  ],
}

/**
 * Owns every Mongoose read for the dashboard, moved verbatim from the legacy
 * handler and run sequentially in the same order. The debug-only Discord
 * structure probes and their logs are dropped: they never fed the response.
 */
export class MongooseUserDashboardStatsReader implements UserDashboardStatsReader {
  async read(): Promise<DashboardCounts> {
    const totalUsers = await User.countDocuments(baseQuery)

    const activeUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'combined.status': 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ativo' },
      ],
    })

    const hotmartUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { $and: [{ hotmartUserId: { $exists: true } }, { hotmartUserId: { $ne: null } }, { hotmartUserId: { $ne: '' } }] },
        { $and: [{ 'hotmart.hotmartUserId': { $exists: true } }, { 'hotmart.hotmartUserId': { $ne: null } }, { 'hotmart.hotmartUserId': { $ne: '' } }] },
      ],
    })

    const curseducaUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { $and: [{ curseducaUserId: { $exists: true } }, { curseducaUserId: { $ne: null } }, { curseducaUserId: { $ne: '' } }] },
        { $and: [{ 'curseduca.curseducaUserId': { $exists: true } }, { 'curseduca.curseducaUserId': { $ne: null } }, { 'curseduca.curseducaUserId': { $ne: '' } }] },
      ],
    })

    const discordUsers = await User.countDocuments({
      ...baseQuery,
      $or: [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } },
      ],
    })

    const bothHotmartAndCurseduca = await User.countDocuments({
      ...baseQuery,
      $and: [hasHotmart, hasCurseduca],
    })

    const hotmartOnly = await User.countDocuments({
      ...baseQuery,
      $and: [hasHotmart, lacksCurseduca],
    })

    const curseducaOnly = await User.countDocuments({
      ...baseQuery,
      $and: [hasCurseduca, lacksHotmart],
    })

    const noPlatform = await User.countDocuments({
      ...baseQuery,
      $and: [lacksHotmart, lacksCurseduca],
    })

    const engagementAgg = await User.aggregate<DashboardEngagement>([
      { $match: baseQuery },
      {
        $project: {
          score: {
            $ifNull: [
              '$combined.engagement.score',
              {
                $ifNull: [
                  '$combined.combinedEngagement',
                  {
                    $ifNull: [
                      '$hotmart.engagement.engagementScore',
                      { $ifNull: ['$curseduca.engagement.alternativeEngagement', 0] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          topPerformers: { $sum: { $cond: [{ $gte: ['$score', 50] }, 1, 0] } },
          needsAttention: {
            $sum: { $cond: [{ $and: [{ $lt: ['$score', 30] }, { $gt: ['$score', 0] }] }, 1, 0] },
          },
          withEngagement: { $sum: { $cond: [{ $gt: ['$score', 0] }, 1, 0] } },
        },
      },
    ])

    const engagement: DashboardEngagement = engagementAgg[0] ?? {
      avgScore: 0,
      topPerformers: 0,
      needsAttention: 0,
      withEngagement: 0,
    }

    const lastHotmartSync = await SyncHistory.findOne({ type: 'hotmart', status: 'completed' })
      .sort({ completedAt: -1 })
      .select('completedAt')
      .lean() as SyncHistoryResult | null

    const lastCurseducaSync = await SyncHistory.findOne({ type: 'curseduca', status: 'completed' })
      .sort({ completedAt: -1 })
      .select('completedAt')
      .lean() as SyncHistoryResult | null

    return {
      totalUsers,
      activeUsers,
      hotmartUsers,
      curseducaUsers,
      discordUsers,
      bothHotmartAndCurseduca,
      hotmartOnly,
      curseducaOnly,
      noPlatform,
      engagement,
      lastHotmartSync: lastHotmartSync?.completedAt ?? null,
      lastCurseducaSync: lastCurseducaSync?.completedAt ?? null,
    }
  }
}
