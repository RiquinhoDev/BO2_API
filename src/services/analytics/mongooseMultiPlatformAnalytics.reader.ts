import type { PipelineStage } from 'mongoose'
import User from '../../models/user'
import type {
  MultiPlatformAnalyticsReader,
  MultiPlatformAnalyticsSnapshot,
} from './multiPlatformAnalytics.service'

interface MultiPlatformAggregationRow {
  _id: null
  totalUsers: number
  activeUsers: number
  hotmartUsers: number
  curseducaUsers: number
  discordUsers: number
  multiPlatformUsers: number
  hotmartEngagementTotal: number
  hotmartEngagementSum: number
  curseducaEngagementTotal: number
  curseducaEngagementSum: number
  combinedEngagementTotal: number
  combinedEngagementSum: number
}

const hasIdentifier = (path: string) => ({
  $and: [
    { $ne: [{ $ifNull: [path, null] }, null] },
    { $ne: [path, ''] },
  ],
})

const hasArrayValue = (path: string) => ({
  $gt: [
    {
      $size: {
        $cond: [{ $isArray: path }, path, []],
      },
    },
    0,
  ],
})

const finiteNonZeroDoubleOrNull = (path: string) => ({
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
            { $ne: ['$$converted', 0] },
          ],
        },
        '$$converted',
        null,
      ],
    },
  },
})

const emptySnapshot = (): MultiPlatformAnalyticsSnapshot => ({
  totalUsers: 0,
  activeUsers: 0,
  hotmartUsers: 0,
  curseducaUsers: 0,
  discordUsers: 0,
  multiPlatformUsers: 0,
  engagement: {
    hotmart: { total: 0, sum: 0 },
    curseduca: { total: 0, sum: 0 },
    combined: { total: 0, sum: 0 },
  },
})

const pipeline: PipelineStage[] = [
  {
    $match: {
      isDeleted: { $ne: true },
      'discord.isDeleted': { $ne: true },
    },
  },
  {
    $project: {
      active: {
        $or: [
          { $eq: ['$combined.status', 'ACTIVE'] },
          { $eq: ['$status', 'ACTIVE'] },
          { $eq: ['$status', 'ativo'] },
        ],
      },
      hasHotmart: {
        $or: [
          hasIdentifier('$hotmart.hotmartUserId'),
          hasIdentifier('$hotmartUserId'),
        ],
      },
      hasCurseduca: {
        $or: [
          hasIdentifier('$curseduca.curseducaUserId'),
          hasIdentifier('$curseducaUserId'),
        ],
      },
      hasDiscord: {
        $or: [
          hasArrayValue('$discord.discordIds'),
          hasArrayValue('$discordIds'),
        ],
      },
      hotmartScore:
        finiteNonZeroDoubleOrNull('$hotmart.engagement.engagementScore'),
      curseducaScore:
        finiteNonZeroDoubleOrNull(
          '$curseduca.engagement.alternativeEngagement',
        ),
      legacyScore: finiteNonZeroDoubleOrNull('$engagement'),
    },
  },
  {
    $project: {
      active: 1,
      hasHotmart: 1,
      hasCurseduca: 1,
      hasDiscord: 1,
      hotmartScore: 1,
      curseducaScore: 1,
      combinedScore: {
        $switch: {
          branches: [
            { case: { $ne: ['$hotmartScore', null] }, then: '$hotmartScore' },
            { case: { $ne: ['$curseducaScore', null] }, then: '$curseducaScore' },
            { case: { $ne: ['$legacyScore', null] }, then: '$legacyScore' },
          ],
          default: null,
        },
      },
    },
  },
  {
    $group: {
      _id: null,
      totalUsers: { $sum: 1 },
      activeUsers: { $sum: { $cond: ['$active', 1, 0] } },
      hotmartUsers: { $sum: { $cond: ['$hasHotmart', 1, 0] } },
      curseducaUsers: { $sum: { $cond: ['$hasCurseduca', 1, 0] } },
      discordUsers: { $sum: { $cond: ['$hasDiscord', 1, 0] } },
      multiPlatformUsers: {
        $sum: {
          $cond: [
            {
              $gte: [
                {
                  $add: [
                    { $cond: ['$hasHotmart', 1, 0] },
                    { $cond: ['$hasCurseduca', 1, 0] },
                    { $cond: ['$hasDiscord', 1, 0] },
                  ],
                },
                2,
              ],
            },
            1,
            0,
          ],
        },
      },
      hotmartEngagementTotal: {
        $sum: { $cond: [{ $ne: ['$hotmartScore', null] }, 1, 0] },
      },
      hotmartEngagementSum: { $sum: { $ifNull: ['$hotmartScore', 0] } },
      curseducaEngagementTotal: {
        $sum: { $cond: [{ $ne: ['$curseducaScore', null] }, 1, 0] },
      },
      curseducaEngagementSum: { $sum: { $ifNull: ['$curseducaScore', 0] } },
      combinedEngagementTotal: {
        $sum: { $cond: [{ $gt: ['$combinedScore', 0] }, 1, 0] },
      },
      combinedEngagementSum: {
        $sum: { $cond: [{ $gt: ['$combinedScore', 0] }, '$combinedScore', 0] },
      },
    },
  },
]

export class MongooseMultiPlatformAnalyticsReader
implements MultiPlatformAnalyticsReader {
  async read(): Promise<MultiPlatformAnalyticsSnapshot> {
    const rows = await User.aggregate<MultiPlatformAggregationRow>(pipeline)
      .option({ maxTimeMS: 120_000 })
      .exec()
    const row = rows[0]

    if (!row) return emptySnapshot()

    return {
      totalUsers: row.totalUsers,
      activeUsers: row.activeUsers,
      hotmartUsers: row.hotmartUsers,
      curseducaUsers: row.curseducaUsers,
      discordUsers: row.discordUsers,
      multiPlatformUsers: row.multiPlatformUsers,
      engagement: {
        hotmart: {
          total: row.hotmartEngagementTotal,
          sum: row.hotmartEngagementSum,
        },
        curseduca: {
          total: row.curseducaEngagementTotal,
          sum: row.curseducaEngagementSum,
        },
        combined: {
          total: row.combinedEngagementTotal,
          sum: row.combinedEngagementSum,
        },
      },
    }
  }
}
