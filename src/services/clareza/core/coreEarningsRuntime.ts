import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreGenerationCandidate } from './coreGeneration.types'
import type { CoreEarningsCompanionStore } from './coreEarningsCompanionStore'
import { projectCoreEarnings, type CoreEarningsAsset } from './coreEarningsProjection'
import { CoreGenerationUnavailableError } from './coreRadarProjection'

interface CoreGenerationReadPort {
  readPublished(): Promise<CoreGenerationCandidate | null>
}

const record = (value: unknown): Readonly<Record<string, unknown>> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : null
)

const addUtcDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function createCoreEarningsRuntime(dependencies: {
  readonly generationStore: CoreGenerationReadPort
  readonly companionStore: CoreEarningsCompanionStore
  readonly universe: readonly ClarezaAsset[]
  readonly now: () => Date
}) {
  const metadata = new Map(dependencies.universe.map(asset => [asset.ticker.trim().toUpperCase(), asset]))
  return {
    async read() {
      const generation = await dependencies.generationStore.readPublished()
      if (!generation) throw new CoreGenerationUnavailableError()
      const companion = await dependencies.companionStore.read(generation.generationId)
      if (!companion) throw new CoreGenerationUnavailableError()
      const assets: CoreEarningsAsset[] = generation.records.map(item => {
        const asset = metadata.get(item.ticker.trim().toUpperCase())
        if (!asset || asset.kind !== item.kind) throw new RangeError(`published Earnings asset mismatch for ${item.ticker}`)
        return {
          ticker: asset.ticker, name: asset.name, kind: asset.kind, type: asset.type,
          data: record(item.datasets.data),
        }
      })
      const today = dependencies.now()
      const from = today.toISOString().slice(0, 10)
      const to = addUtcDays(today, 120).toISOString().slice(0, 10)
      return {
        generationId: generation.generationId,
        universeVersion: generation.universeVersion,
        dataVersion: generation.dataVersion,
        ...projectCoreEarnings(assets, companion.series, from, to, companion.createdAt.toISOString()),
      }
    },
  }
}
