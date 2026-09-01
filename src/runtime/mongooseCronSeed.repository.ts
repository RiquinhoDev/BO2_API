import mongoose from 'mongoose'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import type {
  CronSeedDefinition,
  CronSeedRepositoryPort,
  CronSeedState,
  CronSeedUpdate,
} from './cronSeeds'

const systemCronAdminId = new mongoose.Types.ObjectId(
  '000000000000000000000001',
)

class MongooseCronSeedRepository implements CronSeedRepositoryPort {
  async findByName(name: string): Promise<CronSeedState | null> {
    const job = await CronJobConfig.findOne({ name }).exec()
    if (!job) return null

    return {
      cronExpression: job.schedule.cronExpression,
      timezone: job.schedule.timezone,
      hasCreatedBy: Boolean(job.createdBy),
    }
  }

  async create(seed: CronSeedDefinition): Promise<void> {
    await CronJobConfig.create({
      ...seed,
      tagRules: [...seed.tagRules],
      notifications: {
        ...seed.notifications,
        recipients: [...seed.notifications.recipients],
      },
      nextRun: new Date(),
      createdBy: systemCronAdminId,
      isActive: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
    })
  }

  async update(name: string, updates: CronSeedUpdate): Promise<void> {
    const set: Record<string, string | mongoose.Types.ObjectId> = {}
    if (updates.cronExpression) {
      set['schedule.cronExpression'] = updates.cronExpression
    }
    if (updates.timezone) set['schedule.timezone'] = updates.timezone
    if (updates.ensureCreatedBy) set.createdBy = systemCronAdminId
    if (Object.keys(set).length === 0) return

    await CronJobConfig.updateOne({ name }, { $set: set }).exec()
  }

  async remove(name: string): Promise<void> {
    await CronJobConfig.deleteOne({ name }).exec()
  }
}

export const mongooseCronSeedRepository = new MongooseCronSeedRepository()
