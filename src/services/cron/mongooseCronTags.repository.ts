import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import CronExecution from '../../models/cron/CronExecution'
import type {
  CronStatistics,
  CronTagsRepositoryPort,
  ExecutionQuery,
  StatisticsQuery,
} from './cronTagsCompatibility.types'
import {
  mapCronExecution,
  mapCronJob,
} from './cronTagsMongoose.mapper'

interface StatisticsAggregate {
  totalExecutions: number
  completedExecutions: number
  successfulExecutions: number
  avgDuration: number | null
}

class MongooseCronTagsRepository implements CronTagsRepositoryPort {
  async findJobByName(
    name: string,
  ): Promise<ReturnType<typeof mapCronJob> | null> {
    const job = await CronJobConfig.findOne({ name }).exec()
    return job ? mapCronJob(job) : null
  }

  async listActiveJobs(): Promise<ReturnType<typeof mapCronJob>[]> {
    const jobs = await CronJobConfig.getActiveJobs()
    return jobs.map(mapCronJob)
  }

  async listExecutions(
    query: ExecutionQuery,
  ): Promise<ReturnType<typeof mapCronExecution>[]> {
    const filter = query.cronName ? { cronName: query.cronName } : {}
    const executions = await CronExecution.find(filter)
      .sort({ startTime: -1, _id: -1 })
      .limit(query.limit)
      .exec()

    return executions.map(mapCronExecution)
  }

  async getStatistics(query: StatisticsQuery): Promise<CronStatistics> {
    const [statistics] = await CronExecution.aggregate<StatisticsAggregate>([
      {
        $match: {
          cronName: query.cronName,
          startTime: { $gte: query.since },
        },
      },
      {
        $group: {
          _id: null,
          totalExecutions: { $sum: 1 },
          completedExecutions: {
            $sum: {
              $cond: [
                { $in: ['$status', ['success', 'error']] },
                1,
                0,
              ],
            },
          },
          successfulExecutions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'success'] }, 1, 0],
            },
          },
          avgDuration: {
            $avg: {
              $cond: [
                { $isNumber: '$duration' },
                '$duration',
                null,
              ],
            },
          },
        },
      },
    ]).exec()

    if (!statistics) {
      return {
        totalExecutions: 0,
        successRate: 0,
        avgDuration: 0,
      }
    }

    return {
      totalExecutions: statistics.totalExecutions,
      successRate:
        statistics.completedExecutions > 0
          ? Math.round(
            (statistics.successfulExecutions
              / statistics.completedExecutions)
              * 100,
          )
          : 0,
      avgDuration: Math.round(statistics.avgDuration ?? 0),
    }
  }
}

export const mongooseCronTagsRepository = new MongooseCronTagsRepository()
