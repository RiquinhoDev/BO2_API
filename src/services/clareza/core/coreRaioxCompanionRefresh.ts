import type { CoreRaioxCompanionCollection } from './coreRaioxCompanionCollector'
import type { CoreRaioxCompanionStore } from './coreRaioxCompanionStore'

interface CoreRaioxCompanionCollectorPort {
  collect(generationId: string): Promise<CoreRaioxCompanionCollection>
}

interface CoreRaioxCompanionRefreshDependencies {
  readonly collector: CoreRaioxCompanionCollectorPort
  readonly store: CoreRaioxCompanionStore
}

export function createCoreRaioxCompanionRefresh(
  dependencies: CoreRaioxCompanionRefreshDependencies,
): (generationId: string) => Promise<{ total: number; errors: number }> {
  return async generationId => {
    const existing = await dependencies.store.read(generationId)
    if (existing) return { total: Object.keys(existing.companions).length, errors: 0 }
    const collection = await dependencies.collector.collect(generationId)
    await dependencies.store.replace(collection)
    return {
      total: Object.keys(collection.companions).length,
      errors: collection.errors.length,
    }
  }
}
