import logger from '../utils/logger'
import type { AppConfig } from '../config/appConfig'
import type { Infrastructure } from '../bootstrap'
import mongoose from 'mongoose'
import { cacheService } from '../services/cache.service'
import {
  createRedisRateLimitStoreFactory,
  type RateLimitStoreFactory,
} from '../security/redisRateLimitStore'
import { attachMongoCommandInstrumentation } from '../observability/usage/mongoCommandInstrumentation'

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
    // `monitorCommands` e o que faz o driver emitir commandStarted/Succeeded.
    // Sem isto nao ha forma de saber que coleccoes estao a receber carga.
    await mongoose.connect(config.mongoUri, { monitorCommands: true })
    attachMongoCommandInstrumentation(mongoose.connection)
    logger.info('✅ Ligado ao MongoDB')
  },
  async connectRedis(config: AppConfig): Promise<RateLimitStoreFactory | undefined> {
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
