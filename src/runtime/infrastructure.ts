import logger from '../utils/logger'
import type { AppConfig } from '../config/appConfig'
import type { Infrastructure } from '../bootstrap'
import mongoose from 'mongoose'
import { assertReadOnlyMongoPrivileges } from '../security/readOnlyMode'
import { cacheService } from '../services/cache.service'
import {
  createRedisRateLimitStoreFactory,
  type RateLimitStoreFactory,
} from '../security/redisRateLimitStore'

export class InfrastructureCleanupError extends Error {
  readonly errors: readonly unknown[]

  constructor(errors: readonly unknown[]) {
    super('Infrastructure cleanup failed')
    this.name = 'InfrastructureCleanupError'
    this.errors = errors
  }
}

export const infrastructure: Infrastructure = {
  async connectMongo(config: AppConfig): Promise<void> {
    if (config.readOnlyMode) {
      await mongoose.connect(config.mongoUri, { autoCreate: false, autoIndex: false })
      const database = mongoose.connection.db
      if (!database) throw new Error('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
      assertReadOnlyMongoPrivileges(await database.admin().command({ connectionStatus: 1, showPrivileges: true }))
    } else {
      await mongoose.connect(config.mongoUri)
    }
    logger.info('✅ Ligado ao MongoDB')
  },
  async connectRedis(config: AppConfig): Promise<RateLimitStoreFactory | undefined> {
    if (config.readOnlyMode) return undefined
    if (!config.redis) return undefined
    await cacheService.connect(config.redis)
    return createRedisRateLimitStoreFactory(cacheService.getRateLimitCommandPort(), config.nodeEnv)
  },
  async disconnect(): Promise<void> {
    const results = await Promise.allSettled([
      cacheService.disconnect(),
      mongoose.disconnect(),
    ])
    const failures = results.filter(
      (result): result is { status: 'rejected'; reason: unknown } => result.status === 'rejected',
    )
    if (failures.length > 0) {
      throw new InfrastructureCleanupError(failures.map(({ reason }) => reason))
    }
  },
}
