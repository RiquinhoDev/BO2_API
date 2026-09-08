import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreGenerationCandidate } from './coreGeneration.types'
import type { CoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { projectCoreComparison, type CoreComparadorAsset } from './coreComparadorProjection'
import { CoreGenerationUnavailableError } from './coreRadarProjection'

type JsonRecord = Readonly<Record<string, unknown>>

interface CoreGenerationReadPort {
  readPublished(): Promise<CoreGenerationCandidate | null>
}

interface CoreComparadorRuntimeDependencies {
  readonly generationStore: CoreGenerationReadPort
  readonly companionStore: CoreRaioxCompanionStore
  readonly universe: readonly ClarezaAsset[]
}

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function createCoreComparadorRuntime(dependencies: CoreComparadorRuntimeDependencies) {
  const metadata = new Map(dependencies.universe.map(asset => [asset.ticker.trim().toUpperCase(), asset]))
  const published = async (): Promise<CoreGenerationCandidate> => {
    const generation = await dependencies.generationStore.readPublished()
    if (!generation) throw new CoreGenerationUnavailableError()
    return generation
  }
  const assets = (generation: CoreGenerationCandidate): CoreComparadorAsset[] => generation.records.map(item => {
    const asset = metadata.get(item.ticker.trim().toUpperCase())
    if (!asset || asset.kind !== item.kind) {
      throw new RangeError(`published Comparador asset mismatch for ${item.ticker}`)
    }
    return {
      ticker: asset.ticker, name: asset.name, kind: asset.kind, type: asset.type,
      sector: asset.sector, bucket: asset.bucket,
      data: record(item.datasets.data), evaluation: record(item.datasets.evaluation),
    }
  })

  return {
    async compare(rawSymbols: string) {
      const generation = await published()
      const companion = await dependencies.companionStore.read(generation.generationId)
      const consensus = Object.entries(companion?.companions ?? {}).map(([ticker, item]) => ({
        ticker,
        gradesConsensus: item.gradesConsensus,
        priceTargetConsensus: item.priceTargetConsensus,
        updatedAt: item.updated,
      }))
      return {
        generationId: generation.generationId,
        ...projectCoreComparison(rawSymbols, assets(generation), consensus),
      }
    },

    async search(rawQuery: string) {
      const query = rawQuery.trim().toUpperCase()
      if (query.length > 100) throw new RangeError('Comparador search is too long')
      const generation = await published()
      const matches = assets(generation).flatMap(asset => {
        if (asset.kind !== 'stock' || asset.type === 'reit' || finite(asset.data?.price) === null) return []
        const ticker = asset.ticker.trim().toUpperCase()
        const name = asset.name
        const tickerIndex = ticker.indexOf(query)
        const nameIndex = name.toUpperCase().indexOf(query)
        if (query && tickerIndex < 0 && nameIndex < 0) return []
        const rank = ticker === query ? 0 : tickerIndex === 0 ? 1 : nameIndex === 0 ? 2 : 3
        return [{ rank, value: {
          symbol: ticker, name, sector: metadata.get(ticker)?.sector ?? null, type: asset.type,
        } }]
      }).sort((left, right) => left.rank - right.rank
        || left.value.symbol.localeCompare(right.value.symbol))
      return { query, count: matches.length, results: matches.slice(0, 20).map(item => item.value) }
    },
  }
}
