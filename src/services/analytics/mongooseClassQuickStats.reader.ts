import User from '../../models/user'
import type {
  ClassQuickStatsCounts,
  ClassQuickStatsReader,
} from './classQuickStats.service'

interface ClassQuickStatsAggregation {
  _id: null
  totalStudents: number
  activeStudents: number
}

export class MongooseClassQuickStatsReader
implements ClassQuickStatsReader {
  async countByClass(classId: string): Promise<ClassQuickStatsCounts> {
    const [counts] = await User.aggregate<ClassQuickStatsAggregation>([
      {
        $match: {
          classId,
          'discord.isDeleted': { $ne: true },
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
        },
      },
    ])
      .option({ maxTimeMS: 120_000 })
      .exec()

    if (!counts) {
      return {
        totalStudents: 0,
        activeStudents: 0,
      }
    }

    return {
      totalStudents: counts.totalStudents,
      activeStudents: counts.activeStudents,
    }
  }
}
