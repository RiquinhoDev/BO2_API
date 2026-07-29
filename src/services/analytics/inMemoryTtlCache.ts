export interface TimedCacheHit<T> {
  value: T
  storedAt: number
}

export interface TimedCache<T> {
  get(key: string, now: number): TimedCacheHit<T> | undefined
  set(key: string, value: T, now: number): void
}

export class InMemoryTtlCache<T> implements TimedCache<T> {
  private readonly entries = new Map<string, TimedCacheHit<T>>()

  constructor(private readonly ttlMs: number) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive finite number')
    }
  }

  get(key: string, now: number): TimedCacheHit<T> | undefined {
    const entry = this.entries.get(key)

    if (!entry) {
      return undefined
    }

    if (now - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }

    return entry
  }

  set(key: string, value: T, now: number): void {
    this.entries.set(key, {
      value,
      storedAt: now,
    })
  }
}
