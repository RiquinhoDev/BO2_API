import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreGenerationCandidate, CoreGenerationStore } from './coreGeneration.types'
import { projectCarteiraGeneration } from './coreCarteiraProjection'
import { projectLegacyMarketData, projectRadarGeneration } from './coreRadarProjection'

type JsonRecord = Readonly<Record<string, unknown>>

interface CorePublishedRuntimeDependencies {
  readonly store: CoreGenerationStore
  readonly universe: readonly ClarezaAsset[]
}

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => record(item) !== null) as JsonRecord[] : []
}

function normalizeSymbols(rawSymbols: string): readonly string[] {
  const symbols = [...new Set(rawSymbols.split(',')
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean))]
  if (!symbols.length) throw new RangeError('portfolio analysis requires at least one symbol')
  if (symbols.length > 50) throw new RangeError('portfolio analysis accepts at most 50 symbols')
  if (symbols.some(symbol => !/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(symbol))) {
    throw new RangeError('portfolio analysis contains an invalid symbol')
  }
  return symbols
}

function source(generation: CoreGenerationCandidate | null, universe: readonly ClarezaAsset[]) {
  if (!generation) return null
  const metadata = new Map(universe.map(asset => [asset.ticker, asset]))
  const assets = generation.records.map(item => {
    const asset = metadata.get(item.ticker.trim().toUpperCase())
    if (!asset) throw new RangeError(`published core generation contains unknown ticker ${item.ticker}`)
    if (asset.kind !== item.kind) {
      throw new RangeError(`published core generation kind mismatch for ${item.ticker}`)
    }
    return {
      ...asset,
      data: record(item.datasets.data),
      evaluation: record(item.datasets.evaluation),
    }
  })
  return {
    generationId: generation.generationId,
    universeVersion: generation.universeVersion,
    dataVersion: generation.dataVersion,
    createdAt: generation.createdAt,
    assets,
  }
}

export function createCorePublishedRuntime(dependencies: CorePublishedRuntimeDependencies) {
  const read = async () => source(await dependencies.store.readPublished(), dependencies.universe)
  return {
    async radar() {
      return projectRadarGeneration(await read())
    },

    async legacyMarketData() {
      return projectLegacyMarketData(projectRadarGeneration(await read()))
    },

    async carteira() {
      return projectCarteiraGeneration(await read())
    },

    async portfolioAnalysis(rawSymbols: string) {
      const symbols = normalizeSymbols(rawSymbols)
      const generation = await dependencies.store.readPublished()
      const projected = source(generation, dependencies.universe)
      if (!generation || !projected) projectCarteiraGeneration(null)
      const byTicker = new Map(generation!.records.map(item => [item.ticker.trim().toUpperCase(), item]))
      const results: Record<string, {
        readonly income: readonly JsonRecord[]
        readonly incomeGrowth: readonly JsonRecord[]
        readonly earnings: readonly JsonRecord[]
      }> = {}
      const missing: string[] = []
      for (const symbol of symbols) {
        const item = byTicker.get(symbol)
        if (!item) {
          missing.push(symbol)
          continue
        }
        results[symbol] = {
          income: records(item.datasets['annual-income']),
          incomeGrowth: records(item.datasets['annual-income-growth']),
          earnings: records(item.datasets.earnings),
        }
      }
      return { generationId: generation!.generationId, results, missing }
    },
  }
}
