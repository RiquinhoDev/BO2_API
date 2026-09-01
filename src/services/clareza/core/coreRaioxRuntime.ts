import type { CoreGenerationCandidate } from './coreGeneration.types'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import {
  CoreRaioxAssetUnavailableError,
  composeCoreRaioxPayload,
  type CoreRaioxAssetSource,
} from './coreRaioxComposition'
import type { CoreRaioxCompanionStore } from './coreRaioxCompanionStore'
import { CoreGenerationUnavailableError } from './coreRadarProjection'

type JsonRecord = Readonly<Record<string, unknown>>

interface CoreGenerationReadPort {
  readPublished(): Promise<CoreGenerationCandidate | null>
}

interface CoreRaioxRuntimeDependencies {
  readonly generationStore: CoreGenerationReadPort
  readonly companionStore: CoreRaioxCompanionStore
  readonly universe: readonly ClarezaAsset[]
}

export interface CoreRaioxSearchEntry {
  readonly symbol: string
  readonly name: string
  readonly price: number | null
  readonly exchange: string | null
  readonly currency: string | null
}

function object(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function symbol(raw: string): string {
  const normalized = raw.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(normalized)) {
    throw new RangeError('Raio-X symbol is invalid')
  }
  return normalized
}

export function createCoreRaioxRuntime(dependencies: CoreRaioxRuntimeDependencies) {
  const metadata = new Map(dependencies.universe.map(asset => [asset.ticker.trim().toUpperCase(), asset]))

  const published = async (): Promise<CoreGenerationCandidate> => {
    const generation = await dependencies.generationStore.readPublished()
    if (!generation) throw new CoreGenerationUnavailableError()
    return generation
  }

  return {
    async asset(rawSymbol: string) {
      const ticker = symbol(rawSymbol)
      const generation = await published()
      const record = generation.records.find(item => item.ticker.trim().toUpperCase() === ticker)
      const asset = metadata.get(ticker)
      if (!record || !asset || asset.kind !== 'stock' || asset.type === 'reit') {
        throw new CoreRaioxAssetUnavailableError()
      }
      const data = object(record.datasets.data)
      if (!data) throw new CoreRaioxAssetUnavailableError()
      const companionGeneration = await dependencies.companionStore.read(generation.generationId)
      const core: CoreRaioxAssetSource = {
        generationId: generation.generationId,
        ticker,
        name: asset.name,
        sector: asset.sector,
        data,
        evaluation: object(record.datasets.evaluation),
      }
      return composeCoreRaioxPayload(
        core,
        companionGeneration?.companions[ticker] ?? null,
        companionGeneration?.sectorPe ?? [],
      )
    },

    async search(rawQuery: string): Promise<{
      readonly query: string
      readonly count: number
      readonly results: readonly CoreRaioxSearchEntry[]
    }> {
      const query = rawQuery.trim().toUpperCase()
      if (query.length > 100) throw new RangeError('Raio-X search is too long')
      const generation = await published()
      const matches = generation.records.flatMap(record => {
        const ticker = record.ticker.trim().toUpperCase()
        const asset = metadata.get(ticker)
        if (!asset || asset.kind !== 'stock' || asset.type === 'reit') return []
        const name = asset.name
        const tickerIndex = ticker.indexOf(query)
        const nameIndex = name.toUpperCase().indexOf(query)
        if (query && tickerIndex < 0 && nameIndex < 0) return []
        const rank = ticker === query ? 0
          : tickerIndex === 0 ? 1
            : nameIndex === 0 ? 2 : 3
        const data = object(record.datasets.data) ?? {}
        return [{
          rank,
          value: {
            symbol: ticker,
            name,
            price: finite(data.price),
            exchange: text(data.exchange),
            currency: text(data.currency),
          },
        }]
      }).sort((left, right) => left.rank - right.rank
        || left.value.symbol.localeCompare(right.value.symbol))
      return {
        query,
        count: matches.length,
        results: matches.slice(0, 25).map(match => match.value),
      }
    },
  }
}
