import type { Types } from 'mongoose'
import { Product } from '../../../models'

export type LeanProduct = {
  _id: Types.ObjectId
  code: string
  platform: string
  curseducaGroupId?: string
  platformData?: Record<string, unknown>
  name?: string
}

export interface Clock {
  now(): Date
}

export type ProductLoader = () => Promise<LeanProduct[]>

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

/**
 * In-memory product lookup cache for the sync pipeline. State is encapsulated
 * (no module globals) and the TTL is driven by an injected Clock; the loader is
 * injected so tests never touch Mongo.
 */
export class ProductsCache {
  private map: Map<string, LeanProduct> | null = null
  private timestampMs = 0

  constructor(
    private readonly clock: Clock,
    private readonly loader: ProductLoader,
    private readonly ttlMs: number = CACHE_TTL_MS,
  ) {}

  isLoaded(): boolean {
    return this.map !== null
  }

  async preload(): Promise<void> {
    const nowMs = this.clock.now().getTime()
    if (this.map && nowMs - this.timestampMs < this.ttlMs) return

    const products = await this.loader()
    const map = new Map<string, LeanProduct>()
    for (const p of products) {
      map.set(p.code, p)
      map.set(`${p.platform}:${p.code}`, p)
      if (p.platform === 'curseduca' && p.curseducaGroupId) {
        map.set(`group_${p.curseducaGroupId}`, p)
      }
    }
    this.map = map
    this.timestampMs = nowMs
  }

  get(key: string): LeanProduct | undefined {
    return this.map?.get(key)
  }

  values(): LeanProduct[] {
    return this.map ? Array.from(this.map.values()) : []
  }

  clear(): void {
    this.map = null
    this.timestampMs = 0
  }
}

const defaultLoader: ProductLoader = () =>
  Product.find({ isActive: true })
    .select('_id code platform curseducaGroupId platformData name')
    .lean<LeanProduct[]>()

// Process-wide singleton used by the sync pipeline; clearProductsCache is the
// exported contract that resets it.
export const productsCache = new ProductsCache({ now: () => new Date() }, defaultLoader)

export function clearProductsCache(): void {
  productsCache.clear()
}
