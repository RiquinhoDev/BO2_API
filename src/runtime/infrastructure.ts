import type { AppConfig } from '../config/appConfig'
import type { Infrastructure } from '../bootstrap'
import mongoose from 'mongoose'
import { cacheService } from '../services/cache.service'
import {
  createRedisRateLimitStoreFactory,
  type RateLimitStoreFactory,
} from '../security/redisRateLimitStore'

export const infrastructure: Infrastructure = {
  async connectMongo(config: AppConfig): Promise<void> {
    await mongoose.connect(config.mongoUri)
    console.log('✅ Ligado ao MongoDB')
  },
  async connectRedis(config: AppConfig): Promise<RateLimitStoreFactory | undefined> {
    if (!config.redis) return undefined
    await cacheService.connect(config.redis)
    return createRedisRateLimitStoreFactory(cacheService.getRateLimitCommandPort(), config.nodeEnv)
  },
}
