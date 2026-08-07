import { cacheService } from '../../cache.service'
import ClarezaCarteiraData, { type IClarezaCarteiraItem } from '../../../models/ClarezaCarteiraData'

export interface CarteiraSnapshot {
  fetchedAt: Date
  itemCount: number
  errors: number
  items: IClarezaCarteiraItem[]
}

/**
 * Port for the Carteira cache (Redis) and snapshot store (Mongo). The service
 * depends on this interface; tests inject a fake so no test touches Redis/Mongo.
 */
export interface CarteiraStore {
  readCache(): Promise<IClarezaCarteiraItem[] | null>
  writeCache(items: IClarezaCarteiraItem[], ttl: number): Promise<void>
  saveSnapshot(snapshot: CarteiraSnapshot): Promise<void>
  latestSnapshot(): Promise<{ fetchedAt: Date; items: IClarezaCarteiraItem[] } | null>
}

const SNAPSHOT_KEEP = 5

export class RedisMongoCarteiraStore implements CarteiraStore {
  constructor(private readonly cacheKey: string) {}

  async readCache(): Promise<IClarezaCarteiraItem[] | null> {
    return (await cacheService.get<IClarezaCarteiraItem[]>(this.cacheKey)) ?? null
  }

  async writeCache(items: IClarezaCarteiraItem[], ttl: number): Promise<void> {
    await cacheService.set(this.cacheKey, items, ttl)
  }

  async saveSnapshot(snapshot: CarteiraSnapshot): Promise<void> {
    await ClarezaCarteiraData.create(snapshot)
    const all = await ClarezaCarteiraData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > SNAPSHOT_KEEP) {
      const toDelete = all.slice(SNAPSHOT_KEEP).map((document) => document._id)
      await ClarezaCarteiraData.deleteMany({ _id: { $in: toDelete } })
    }
  }

  async latestSnapshot(): Promise<{ fetchedAt: Date; items: IClarezaCarteiraItem[] } | null> {
    const latest = await ClarezaCarteiraData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.items?.length) return { fetchedAt: latest.fetchedAt, items: latest.items }
    return null
  }
}
