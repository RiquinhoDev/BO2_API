import type { CoreTop10CompanionCollection } from './coreTop10CompanionCollector'
import type { CoreTop10CompanionStore } from './coreTop10CompanionStore'

export function createCoreTop10CompanionRefresh(dependencies: {
  readonly collector: { collect(generationId: string): Promise<CoreTop10CompanionCollection> }
  readonly store: CoreTop10CompanionStore
}): (generationId: string) => Promise<{ total: number; errors: number }> {
  return async generationId => {
    const existing = await dependencies.store.read(generationId)
    if (existing) return { total: existing.histories.length, errors: existing.errors.length }
    const collection = await dependencies.collector.collect(generationId)
    await dependencies.store.replace(collection)
    return { total: collection.histories.length, errors: collection.errors.length }
  }
}
