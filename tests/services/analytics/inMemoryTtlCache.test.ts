import { InMemoryTtlCache } from '../../../src/services/analytics/inMemoryTtlCache'

describe('InMemoryTtlCache', () => {
  it('returns an entry until the exact TTL boundary', () => {
    const cache = new InMemoryTtlCache<{ total: number }>(300_000)

    cache.set('global', { total: 2 }, 1_000)

    expect(cache.get('global', 300_999)).toEqual({
      value: { total: 2 },
      storedAt: 1_000,
    })
    expect(cache.get('global', 301_000)).toBeUndefined()
  })

  it('deletes expired entries instead of retaining stale values', () => {
    const cache = new InMemoryTtlCache<{ total: number }>(300_000)

    cache.set('global', { total: 2 }, 1_000)
    expect(cache.get('global', 301_001)).toBeUndefined()
    expect(cache.get('global', 1_001)).toBeUndefined()
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid TTL: %s',
    (ttl) => {
      expect(() => new InMemoryTtlCache(ttl)).toThrow(RangeError)
    },
  )
})
