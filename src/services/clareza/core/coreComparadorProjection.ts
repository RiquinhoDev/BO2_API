import type { CoreAssetKind } from './coreGeneration.types'
import type { CoreAnalystConsensusDataset } from './coreAnalystConsensus'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreComparadorAsset {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly data: JsonRecord | null
  readonly evaluation: JsonRecord | null
}

export interface CoreComparadorCompany extends JsonRecord {
  readonly ticker: string
  readonly name: string
  readonly type: 'growth' | 'value'
  readonly currency: string | null
  readonly analystConsensus: JsonRecord | null
  readonly priceTargetConsensus: JsonRecord | null
  readonly coreEvaluation: JsonRecord | null
}

export interface CoreComparadorProjection {
  readonly count: number
  readonly companies: readonly CoreComparadorCompany[]
  readonly rejected: readonly {
    readonly ticker: string
    readonly reason: 'unknown-symbol' | 'ineligible-kind'
  }[]
}

export class CoreComparadorRequestError extends Error {
  readonly code = 'CLAREZA_CORE_COMPARADOR_REQUEST_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'CoreComparadorRequestError'
  }
}

const normalize = (ticker: string): string => ticker.trim().toUpperCase()

export function projectCoreComparison(
  rawSymbols: string,
  assets: readonly CoreComparadorAsset[],
  consensusDatasets: readonly CoreAnalystConsensusDataset[],
): CoreComparadorProjection {
  const symbols = [...new Set(rawSymbols.split(',').map(normalize).filter(Boolean))]
  if (!symbols.length || symbols.length > 4) {
    throw new CoreComparadorRequestError('comparison requires between one and four unique symbols')
  }
  const assetsByTicker = new Map(assets.map(asset => [normalize(asset.ticker), asset]))
  const consensusByTicker = new Map(consensusDatasets.map(item => [normalize(item.ticker), item]))
  const companies: CoreComparadorCompany[] = []
  const rejected: CoreComparadorProjection['rejected'][number][] = []
  for (const ticker of symbols) {
    const asset = assetsByTicker.get(ticker)
    if (!asset) {
      rejected.push({ ticker, reason: 'unknown-symbol' })
      continue
    }
    if (asset.kind !== 'stock' || (asset.type !== 'growth' && asset.type !== 'value')) {
      rejected.push({ ticker, reason: 'ineligible-kind' })
      continue
    }
    const data = asset.data ?? {}
    const consensus = consensusByTicker.get(ticker)
    companies.push({
      ...data,
      ticker,
      name: asset.name,
      type: asset.type,
      currency: typeof data.currency === 'string' ? data.currency : null,
      analystConsensus: consensus?.gradesConsensus ?? null,
      priceTargetConsensus: consensus?.priceTargetConsensus ?? null,
      coreEvaluation: asset.evaluation ? { ...asset.evaluation } : null,
    })
  }
  return { count: companies.length, companies, rejected }
}
