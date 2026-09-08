export interface FmpRequestDeduplicator {
  run<T>(key: string, operation: () => Promise<T>): Promise<T>
}

export class FmpInFlightDeduplicator implements FmpRequestDeduplicator {
  private readonly pending = new Map<string, Promise<unknown>>()

  get pendingCount(): number {
    return this.pending.size
  }

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key) as Promise<T> | undefined
    if (existing) return existing

    const tracked = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.pending.get(key) === tracked) this.pending.delete(key)
      })
    this.pending.set(key, tracked)
    return tracked
  }
}
