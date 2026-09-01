import type { CoreAssetKind } from './coreGeneration.types'
import { CoreGenerationUnavailableError } from './coreRadarProjection'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreCarteiraAssetSource {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly bucket: string
  readonly sector: string
  readonly data: JsonRecord | null
  readonly evaluation: JsonRecord | null
}

export interface CoreCarteiraGenerationSource {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly createdAt: Date
  readonly assets: readonly CoreCarteiraAssetSource[]
}

export interface CoreCarteiraEntry extends CoreCarteiraAssetSource {
  readonly evaluation: JsonRecord | null
}

export interface CoreCarteiraPayload {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly updated: string
  readonly count: number
  readonly items: readonly CoreCarteiraEntry[]
}

export function projectCarteiraGeneration(
  source: CoreCarteiraGenerationSource | null,
): CoreCarteiraPayload {
  if (!source) throw new CoreGenerationUnavailableError()
  if (!source.generationId.trim() || Number.isNaN(source.createdAt.getTime())) {
    throw new RangeError('core Carteira generation identity is invalid')
  }
  const normalizedTickers = source.assets.map(asset => asset.ticker.trim().toUpperCase())
  if (new Set(normalizedTickers).size !== normalizedTickers.length) {
    throw new RangeError('core Carteira generation contains duplicate tickers')
  }
  const items = source.assets.map(asset => ({
    ticker: asset.ticker.trim().toUpperCase(),
    name: asset.name,
    kind: asset.kind,
    type: asset.type,
    bucket: asset.bucket,
    sector: asset.sector,
    data: asset.data ? { ...asset.data } : null,
    evaluation: asset.kind === 'stock'
      ? asset.evaluation ? { ...asset.evaluation } : null
      : null,
  })).sort((left, right) => left.ticker.localeCompare(right.ticker))
  return {
    generationId: source.generationId,
    universeVersion: source.universeVersion,
    dataVersion: source.dataVersion,
    updated: source.createdAt.toISOString(),
    count: items.length,
    items,
  }
}
