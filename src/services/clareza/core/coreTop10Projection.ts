import type { CoreAssetKind } from './coreGeneration.types'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreTop10Asset {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly sector?: string
  readonly data: JsonRecord | null
}

export interface CoreTop10Source {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly createdAt: Date
  readonly assets: readonly CoreTop10Asset[]
}

export interface CoreTop10Selection {
  readonly key: string
  readonly canonicalTicker: string
  readonly currency: string
}

export interface CoreTop10History {
  readonly ticker: string
  readonly points: readonly { readonly date: string; readonly close: number }[]
}

const normalize = (ticker: string): string => ticker.trim().toUpperCase()
const finite = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
)
const text = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value : null
)
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function projectCoreTop10(
  source: CoreTop10Source,
  selections: readonly CoreTop10Selection[],
  histories: readonly CoreTop10History[],
  revision: string,
) {
  if (!source.generationId.trim() || Number.isNaN(source.createdAt.getTime()) || !revision.trim()) {
    throw new RangeError('core Top 10 projection identity is invalid')
  }
  const keys = selections.map(item => normalize(item.key))
  const canonicals = selections.map(item => normalize(item.canonicalTicker))
  if (new Set(keys).size !== keys.length) throw new RangeError('Top 10 selection contains duplicate keys')
  if (new Set(canonicals).size !== canonicals.length) throw new RangeError('Top 10 selection contains duplicate canonical tickers')
  const assets = new Map(source.assets.map(asset => [normalize(asset.ticker), asset]))
  const historyByTicker = new Map(histories.map(history => [normalize(history.ticker), history.points]))
  const stocks: Record<string, JsonRecord> = {}
  const rejected: Array<{
    key: string
    canonicalTicker: string
    reason: 'unknown-symbol' | 'ineligible-kind'
  }> = []
  const missing: string[] = []
  let available = 0
  for (const selection of selections) {
    const key = normalize(selection.key)
    const canonicalTicker = normalize(selection.canonicalTicker)
    const asset = assets.get(canonicalTicker)
    if (!asset) {
      rejected.push({ key, canonicalTicker, reason: 'unknown-symbol' })
      continue
    }
    if (asset.kind !== 'stock') {
      rejected.push({ key, canonicalTicker, reason: 'ineligible-kind' })
      continue
    }
    const data = asset.data ?? {}
    const price = finite(data.price)
    if (price === null) missing.push(canonicalTicker)
    else available += 1
    const historical = (historyByTicker.get(canonicalTicker) ?? [])
      .filter(point => validDate(point.date) && Number.isFinite(point.close))
      .map(point => ({ date: point.date, close: point.close }))
      .sort((left, right) => left.date.localeCompare(right.date))
    stocks[key] = {
      price,
      change: finite(data.change),
      sector: text(data.sector) ?? asset.sector ?? null,
      country: text(data.country),
      pe: finite(data.pe), pb: finite(data.pb), ps: finite(data.ps), peg: finite(data.peg),
      evEbitda: finite(data.evEbitda), grossMargin: finite(data.grossMarginTTM),
      netMargin: finite(data.netMargin), roe: finite(data.roe), debtEbitda: finite(data.debtEbitda),
      dividendYield: finite(data.dividendYield), currency: selection.currency,
      historical,
      isPrivate: false,
      updated: text(data.updated),
    }
  }
  return {
    generationId: source.generationId,
    universeVersion: source.universeVersion,
    dataVersion: source.dataVersion,
    updated: source.createdAt.toISOString(),
    revision,
    source: 'Clareza (cérebro + universo partilhados)',
    stocks,
    rejected,
    coverage: { selected: selections.length, available, missing },
  }
}
