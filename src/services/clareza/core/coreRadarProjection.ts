import type { CoreAssetKind } from './coreGeneration.types'

export interface CoreRadarAssetSource {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly bucket: string
  readonly sector: string
  readonly data: Readonly<Record<string, unknown>> | null
  readonly evaluation: Readonly<Record<string, unknown>> | null
}

export interface CoreRadarGenerationSource {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly createdAt: Date
  readonly assets: readonly CoreRadarAssetSource[]
}

export interface CoreRadarEntry {
  readonly ticker: string
  readonly name: string
  readonly type: 'growth' | 'value' | 'reit'
  readonly kind: 'stock'
  readonly bucket: string
  readonly sector: string
  readonly data: Readonly<Record<string, unknown>> | null
  readonly evaluation: Readonly<Record<string, unknown>> | null
}

export interface CoreRadarPayload {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly updated: string
  readonly count: number
  readonly stocks: readonly CoreRadarEntry[]
}

export class CoreGenerationUnavailableError extends Error {
  readonly code = 'CLAREZA_CORE_GENERATION_UNAVAILABLE'

  constructor() {
    super('published Clareza core generation is unavailable')
    this.name = 'CoreGenerationUnavailableError'
  }
}

export function projectRadarGeneration(
  source: CoreRadarGenerationSource | null,
): CoreRadarPayload {
  if (!source) throw new CoreGenerationUnavailableError()
  if (!source.generationId.trim() || Number.isNaN(source.createdAt.getTime())) {
    throw new RangeError('core Radar generation identity is invalid')
  }
  const eligible = source.assets.filter((asset): asset is CoreRadarAssetSource & {
    readonly kind: 'stock'
    readonly type: 'growth' | 'value' | 'reit'
  } => asset.kind === 'stock'
    && (asset.type === 'growth' || asset.type === 'value' || asset.type === 'reit'))
  const tickers = eligible.map(asset => asset.ticker.trim().toUpperCase())
  if (new Set(tickers).size !== tickers.length) {
    throw new RangeError('core Radar generation contains duplicate tickers')
  }
  const stocks = eligible.map(asset => ({
    ticker: asset.ticker.trim().toUpperCase(),
    name: asset.name,
    type: asset.type,
    kind: asset.kind,
    bucket: asset.bucket,
    sector: asset.sector,
    data: asset.data ? { ...asset.data } : null,
    evaluation: asset.evaluation ? { ...asset.evaluation } : null,
  })).sort((left, right) => left.ticker.localeCompare(right.ticker))
  return {
    generationId: source.generationId,
    universeVersion: source.universeVersion,
    dataVersion: source.dataVersion,
    updated: source.createdAt.toISOString(),
    count: stocks.length,
    stocks,
  }
}
