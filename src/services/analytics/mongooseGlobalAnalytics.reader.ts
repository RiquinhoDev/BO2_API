import { Class } from '../../models/Class'
import User from '../../models/user'
import type {
  EngagementDistribution,
  GlobalAnalyticsRead,
  GlobalAnalyticsReader,
} from './globalAnalytics.service'

interface ActiveClassProjection {
  classId: string
}

interface GlobalAnalyticsAggregation {
  _id: null
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  muito_alto: number
  alto: number
  medio: number
  baixo: number
  muito_baixo: number
}

const emptyDistribution = (): EngagementDistribution => ({
  muito_alto: 0,
  alto: 0,
  medio: 0,
  baixo: 0,
  muito_baixo: 0,
})

export class MongooseGlobalAnalyticsReader
implements GlobalAnalyticsReader {
  async read(): Promise<GlobalAnalyticsRead> {
    const activeClasses = await Class.find({
      $or: [
        { isActive: true },
        { status: 'active' },
      ],
    })
      .select({ classId: 1, _id: 0 })
      .lean<ActiveClassProjection[]>()
      .exec()

    if (activeClasses.length === 0) {
      return {
        totalClasses: 0,
        totalStudents: 0,
        activeStudents: 0,
        averageEngagement: 0,
        engagementDistribution: emptyDistribution(),
      }
    }

    const classIds = activeClasses.map(({ classId }) => classId)
    const [result] = await User.aggregate<GlobalAnalyticsAggregation>([
      {
        $match: {
          classId: { $in: classIds },
          'discord.isDeleted': { $ne: true },
        },
      },
      {
        $set: {
          score: {
            $ifNull: [
              '$combined.engagement.score',
              {
                $ifNull: [
                  '$combined.combinedEngagement',
                  {
                    $ifNull: [
                      '$hotmart.engagement.engagementScore',
                      {
                        $ifNull: [
                          '$curseduca.engagement.alternativeEngagement',
                          0,
                        ],
                      },
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
          totalStudents: { $sum: 1 },
          activeStudents: {
            $sum: {
              $cond: [
                { $eq: ['$combined.status', 'ACTIVE'] },
                1,
                0,
              ],
            },
          },
          averageEngagement: { $avg: '$score' },
          muito_alto: {
            $sum: {
              $cond: [{ $gte: ['$score', 80] }, 1, 0],
            },
          },
          alto: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$score', 60] },
                    { $lt: ['$score', 80] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          medio: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$score', 40] },
                    { $lt: ['$score', 60] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          baixo: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$score', 20] },
                    { $lt: ['$score', 40] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          muito_baixo: {
            $sum: {
              $cond: [{ $lt: ['$score', 20] }, 1, 0],
            },
          },
        },
      },
    ])
      .option({ maxTimeMS: 120_000 })
      .exec()

    if (!result) {
      return {
        totalClasses: activeClasses.length,
        totalStudents: 0,
        activeStudents: 0,
        averageEngagement: 0,
        engagementDistribution: emptyDistribution(),
      }
    }

    return {
      totalClasses: activeClasses.length,
      totalStudents: result.totalStudents,
      activeStudents: result.activeStudents,
      averageEngagement: Math.round(result.averageEngagement),
      engagementDistribution: {
        muito_alto: result.muito_alto,
        alto: result.alto,
        medio: result.medio,
        baixo: result.baixo,
        muito_baixo: result.muito_baixo,
      },
    }
  }
}
