import mongoose from 'mongoose'
import {
  ProductsCache,
  clearProductsCache,
  productsCache,
  type LeanProduct,
} from '../../../src/services/syncUtilizadoresServices/universalSync/productsCache'

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

const products = (): LeanProduct[] => [
  { _id: oid(1), code: 'OGI_V1', platform: 'hotmart', name: 'OGI' },
  { _id: oid(2), code: 'CURSO', platform: 'curseduca', curseducaGroupId: 'G9', name: 'Curso' },
]

function makeCache(ttlMs = 1000) {
  let t = 1000
  const loader = jest.fn().mockResolvedValue(products())
  const cache = new ProductsCache({ now: () => new Date(t) }, loader, ttlMs)
  return { cache, loader, advanceTo: (ms: number) => { t = ms } }
}

describe('ProductsCache', () => {
  it('preload maps by code, platform:code, and curseduca group', async () => {
    const { cache, loader } = makeCache()
    await cache.preload()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.isLoaded()).toBe(true)
    expect(cache.get('OGI_V1')?.code).toBe('OGI_V1')
    expect(cache.get('hotmart:OGI_V1')?.code).toBe('OGI_V1')
    expect(cache.get('curseduca:CURSO')?.code).toBe('CURSO')
    expect(cache.get('group_G9')?.code).toBe('CURSO')
    expect(cache.get('missing')).toBeUndefined()
    // values() carries one entry per key (duplicates), matching how the
    // determineProductId consumers use .find(p => p.platform === ...).
    expect(cache.values().find((p) => p.platform === 'curseduca')?.code).toBe('CURSO')
    expect(cache.values().find((p) => p.platform === 'hotmart')?.code).toBe('OGI_V1')
  })

  it('reuses the cache within the TTL and reloads after it', async () => {
    const { cache, loader, advanceTo } = makeCache(1000)
    await cache.preload() // t=1000, loads

    advanceTo(1500)
    await cache.preload() // within TTL -> no reload
    expect(loader).toHaveBeenCalledTimes(1)

    advanceTo(2100) // 1100ms elapsed >= 1000 TTL
    await cache.preload()
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('clear() invalidates so the next preload reloads', async () => {
    const { cache, loader } = makeCache()
    await cache.preload()
    cache.clear()

    expect(cache.isLoaded()).toBe(false)
    expect(cache.get('OGI_V1')).toBeUndefined()
    expect(cache.values()).toEqual([])

    await cache.preload()
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not deduplicate concurrent preloads on a cold cache (documented behaviour)', async () => {
    const { cache, loader } = makeCache()
    await Promise.all([cache.preload(), cache.preload()])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('clearProductsCache resets the shared singleton', () => {
    clearProductsCache()
    expect(productsCache.isLoaded()).toBe(false)
  })
})
