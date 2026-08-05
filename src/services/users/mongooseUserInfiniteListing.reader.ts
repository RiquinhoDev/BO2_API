import mongoose from 'mongoose'
import User from '../../models/user'
import { cacheService } from '../../services/cache.service'
import type {
  InfiniteListingEnvelope,
  UserInfiniteListingReader,
} from './userInfiniteListing.service'

type PipelineStage = mongoose.PipelineStage

/**
 * Owns the cache and Mongoose access for the infinite listing, moved verbatim
 * from the legacy handler: the same allowDiskUse/maxTimeMS options and the same
 * estimated-count and count-pipeline calls.
 */
export class MongooseUserInfiniteListingReader implements UserInfiniteListingReader {
  cacheKey(prefix: string, params: Record<string, unknown>): string {
    return cacheService.getCacheKey(prefix, params)
  }

  cacheGet(key: string): Promise<InfiniteListingEnvelope | null> {
    return cacheService.get<InfiniteListingEnvelope>(key)
  }

  cacheSet(key: string, value: InfiniteListingEnvelope, ttl: number): Promise<void> {
    return cacheService.set(key, value, ttl)
  }

  aggregateUsers(pipeline: PipelineStage[]): Promise<Array<Record<string, unknown>>> {
    return User.aggregate(pipeline)
      .allowDiskUse(true)
      .option({ maxTimeMS: 30000 })
      .exec() as unknown as Promise<Array<Record<string, unknown>>>
  }

  estimatedCount(): Promise<number> {
    return User.estimatedDocumentCount()
  }

  countWithPipeline(pipeline: PipelineStage[]): Promise<Array<{ total?: number }>> {
    return User.aggregate(pipeline)
      .option({ maxTimeMS: 5000 })
      .exec() as unknown as Promise<Array<{ total?: number }>>
  }
}
