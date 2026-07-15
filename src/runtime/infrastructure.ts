import type { AppConfig } from '../config/appConfig'
import type { Infrastructure } from '../bootstrap'
import mongoose from 'mongoose'
import { cacheService } from '../services/cache.service'

export const infrastructure: Infrastructure = {
  async connectMongo(config: AppConfig): Promise<void> {
    await mongoose.connect(config.mongoUri)
    console.log('✅ Ligado ao MongoDB')
  },
  async connectRedis(config: AppConfig): Promise<void> {
    if (!config.redis) return
    await cacheService.connect()
  },
}
