import type { CoreAssetKind } from './coreGeneration.types'
import type { CoreAnalystConsensusDataset } from './coreAnalystConsensus'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreComparadorAsset {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly sector?: string
  readonly bucket?: string
  readonly data: JsonRecord | null
  readonly evaluation: JsonRecord | null
}

export interface CoreComparadorCompany extends JsonRecord {
  readonly ticker: string
  readonly name: string
  readonly type: 'growth' | 'value'
  readonly currency: string | null
  readonly analystConsensus: string | null
  readonly targetConsensus: number | null
  readonly upside: number | null
  readonly coreEvaluation: JsonRecord | null
  readonly evaluation: JsonRecord | null
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
const VALID_SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,19}$/
const finite = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)
const text = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value : null
)

export function projectCoreComparison(
  rawSymbols: string,
  assets: readonly CoreComparadorAsset[],
  consensusDatasets: readonly CoreAnalystConsensusDataset[],
): CoreComparadorProjection {
  const symbols = [...new Set(rawSymbols.split(',').map(normalize).filter(Boolean))]
  if (symbols.some(symbol => !VALID_SYMBOL.test(symbol))) {
    throw new CoreComparadorRequestError('comparison contains an invalid symbol')
  }
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
    const grades = consensus?.gradesConsensus ?? {}
    const target = consensus?.priceTargetConsensus ?? {}
    const price = finite(data.price)
    const targetConsensus = finite(target.targetConsensus)
    const evaluation = asset.evaluation ? { ...asset.evaluation } : null
    companies.push({
      ticker,
      name: asset.name,
      sector: text(data.sector) ?? asset.sector ?? null,
      type: asset.type,
      bucket: text(data.bucket) ?? asset.bucket ?? asset.type,
      industry: text(data.industry),
      currency: typeof data.currency === 'string' ? data.currency : null,
      exchange: text(data.exchange),
      price,
      change: finite(data.change), perf12m: finite(data.perf12m),
      marketCap: finite(data.marketCap), beta: finite(data.beta),
      pe: finite(data.pe), peg: finite(data.peg), ps: finite(data.ps), pb: finite(data.pb),
      evEbitda: finite(data.evEbitda),
      grossMargin: finite(data.grossMarginTTM), netMargin: finite(data.netMargin),
      roe: finite(data.roe), roic: finite(data.roic), fcfYield: finite(data.fcfYield),
      debtEquity: finite(data.debtEquity), debtEbitda: finite(data.debtEbitda),
      dividendYield: finite(data.dividendYield), payoutRatio: finite(data.payoutRatio),
      analystConsensus: text(grades.consensus),
      strongBuy: finite(grades.strongBuy), buy: finite(grades.buy), hold: finite(grades.hold),
      sell: finite(grades.sell), strongSell: finite(grades.strongSell),
      targetConsensus,
      upside: targetConsensus !== null && price !== null && price !== 0
        ? Number((((targetConsensus - price) / price) * 100).toFixed(1))
        : null,
      updated: text(data.updated),
      analystsUpdated: consensus?.updatedAt ?? null,
      coreEvaluation: evaluation,
      evaluation,
    })
  }
  return { count: companies.length, companies, rejected }
}
