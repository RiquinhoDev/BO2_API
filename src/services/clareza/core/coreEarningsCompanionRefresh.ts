import type { CoreEarningsCompanionCollection } from './coreEarningsCompanionCollector'
import type { CoreEarningsCompanionStore } from './coreEarningsCompanionStore'

interface CoreEarningsCompanionCollectorPort {
  collect(generationId: string): Promise<CoreEarningsCompanionCollection>
}

export function createCoreEarningsCompanionRefresh(dependencies: {
  readonly collector: CoreEarningsCompanionCollectorPort
  readonly store: CoreEarningsCompanionStore
}): (generationId: string) => Promise<{ total: number; errors: number }> {
  return async generationId => {
    const existing = await dependencies.store.read(generationId)
    if (existing) return { total: existing.series.length, errors: existing.errors.length }
    const collection = await dependencies.collector.collect(generationId)
    await dependencies.store.replace(collection)
    return { total: collection.series.length, errors: collection.errors.length }
  }
}
