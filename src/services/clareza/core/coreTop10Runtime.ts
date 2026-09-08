import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreGenerationCandidate } from './coreGeneration.types'
import type { CoreTop10CompanionStore } from './coreTop10CompanionStore'
import { projectCoreTop10, type CoreTop10Asset, type CoreTop10Selection } from './coreTop10Projection'
import { CoreGenerationUnavailableError } from './coreRadarProjection'

export function createCoreTop10Runtime(dependencies: {
  readonly generationStore: { readPublished(): Promise<CoreGenerationCandidate | null> }
  readonly companionStore: CoreTop10CompanionStore
  readonly universe: readonly ClarezaAsset[]
  readonly selections: readonly CoreTop10Selection[]
  readonly revision: string
}) {
  const metadata = new Map(dependencies.universe.map(asset => [asset.ticker.trim().toUpperCase(), asset]))
  return {
    async read() {
      const generation = await dependencies.generationStore.readPublished()
      if (!generation) throw new CoreGenerationUnavailableError()
      const companion = await dependencies.companionStore.read(generation.generationId)
      if (!companion) throw new CoreGenerationUnavailableError()
      const assets: CoreTop10Asset[] = generation.records.map(item => {
        const asset = metadata.get(item.ticker.trim().toUpperCase())
        if (!asset || asset.kind !== item.kind) throw new RangeError(`published Top 10 asset mismatch for ${item.ticker}`)
        const data = typeof item.datasets.data === 'object' && item.datasets.data !== null && !Array.isArray(item.datasets.data)
          ? item.datasets.data as Readonly<Record<string, unknown>> : null
        return { ticker: asset.ticker, name: asset.name, kind: asset.kind, sector: asset.sector, data }
      })
      return projectCoreTop10({
        generationId: generation.generationId,
        universeVersion: generation.universeVersion,
        dataVersion: generation.dataVersion,
        createdAt: companion.createdAt,
        assets,
      }, dependencies.selections, companion.histories, dependencies.revision)
    },
  }
}
