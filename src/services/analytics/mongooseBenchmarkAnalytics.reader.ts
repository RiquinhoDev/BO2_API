import type { PipelineStage } from 'mongoose'
import { Class } from '../../models/Class'
import User from '../../models/user'
import type {
  BenchmarkAnalyticsRead,
  BenchmarkAnalyticsReader,
  BenchmarkClassRead,
} from './benchmarkAnalytics.service'

interface ActiveClassProjection {
  classId: string
  name?: string
}

interface BenchmarkClassAggregation {
  _id: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  averageProgress: number
}

export class MongooseBenchmarkAnalyticsReader
implements BenchmarkAnalyticsReader {
  async read(): Promise<BenchmarkAnalyticsRead> {
    const classes = await Class.find({
      $or: [
        { isActive: true },
        { status: 'active' },
      ],
    })
      .select({ classId: 1, name: 1, _id: 0 })
      .lean<ActiveClassProjection[]>()
      .exec()

    const activeClasses = classes.map(activeClass => ({
      classId: activeClass.classId,
      className: activeClass.name?.trim() || 'Turma sem nome',
    }))

    if (activeClasses.length === 0) {
      return {
        activeClasses,
        metricsByClassId: new Map(),
      }
    }

    const classIds = activeClasses.map(activeClass => activeClass.classId)
    const pipeline: PipelineStage[] = [
      {
        $match: {
          classId: { $in: classIds },
          isDeleted: { $ne: true },
          'discord.isDeleted': { $ne: true },
        },
      },
      {
        $set: {
          resolvedStatus: {
            $ifNull: ['$combined.status', '$status'],
          },
          rawEngagement: {
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
          hotmartLessonCount: {
            $size: {
              $ifNull: ['$hotmart.progress.lessonsData', []],
            },
          },
        },
      },
      {
        $set: {
          hotmartProgress: {
            $cond: [
              { $gt: ['$hotmartLessonCount', 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $ifNull: [
                          '$hotmart.progress.completedLessons',
                          0,
                        ],
                      },
                      '$hotmartLessonCount',
                    ],
                  },
                  100,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $set: {
          rawProgress: {
            $ifNull: [
              '$combined.totalProgress',
              {
                $ifNull: [
                  '$hotmartProgress',
                  {
                    $ifNull: [
                      '$curseduca.progress.estimatedProgress',
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          resolvedEngagement: {
            $min: [
              100,
              { $max: [0, '$rawEngagement'] },
            ],
          },
          resolvedProgress: {
            $min: [
              100,
              { $max: [0, '$rawProgress'] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$classId',
          totalStudents: { $sum: 1 },
          activeStudents: {
            $sum: {
              $cond: [
                { $eq: ['$resolvedStatus', 'ACTIVE'] },
                1,
                0,
              ],
            },
          },
          averageEngagement: { $avg: '$resolvedEngagement' },
          averageProgress: { $avg: '$resolvedProgress' },
        },
      },
    ]

    const grouped = await User.aggregate<BenchmarkClassAggregation>(pipeline)
      .option({ maxTimeMS: 120_000 })
      .exec()
    const groupedByClassId = new Map(
      grouped.map(item => [item._id, item]),
    )
    const metricsByClassId = new Map<string, BenchmarkClassRead>()

    for (const activeClass of activeClasses) {
      const item = groupedByClassId.get(activeClass.classId)
      if (!item) continue
      metricsByClassId.set(activeClass.classId, {
        totalStudents: item.totalStudents,
        activeStudents: item.activeStudents,
        averageEngagement: Math.round(item.averageEngagement),
        averageProgress: Math.round(item.averageProgress),
      })
    }

    return {
      activeClasses,
      metricsByClassId,
    }
  }
}
