import type { CoreGenerationStore } from './coreGeneration.types'
import type { CoreAliasReader } from './coreAliasStore'
import { searchCoreCarteira } from './coreCarteiraSearch'

interface SearchUniverseAsset {
  readonly ticker: string
  readonly name: string
  readonly kind: 'stock' | 'fund' | 'crypto'
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
}

interface CoreCarteiraSearchRuntimeDependencies {
  readonly generationStore: Pick<CoreGenerationStore, 'readPublished'>
  readonly aliasStore: CoreAliasReader
  readonly universe: readonly SearchUniverseAsset[]
}

const jsonRecord = (value: unknown): Readonly<Record<string, unknown>> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null
)

export function createCoreCarteiraSearchRuntime(
  dependencies: CoreCarteiraSearchRuntimeDependencies,
) {
  return async (query: string) => {
    const [published, aliases] = await Promise.all([
      dependencies.generationStore.readPublished(),
      dependencies.aliasStore.read(),
    ])
    const dataByTicker = new Map((published?.records ?? []).map(record => [
      record.ticker.trim().toUpperCase(), jsonRecord(record.datasets.data),
    ]))
    return searchCoreCarteira(
      query,
      dependencies.universe.map(asset => ({
        ...asset,
        data: dataByTicker.get(asset.ticker.trim().toUpperCase()) ?? null,
      })),
      aliases.state.aliases,
    )
  }
}
