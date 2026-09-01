import type { CoreAssetKind } from './coreGeneration.types'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreEarningsAsset {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly data: JsonRecord | null
}

export interface CoreEarningsEvent {
  readonly date: string
  readonly epsEstimated?: number | string | null
  readonly epsActual?: number | string | null
  readonly reportedEPS?: number | string | null
}

export interface CoreEarningsSeries {
  readonly ticker: string
  readonly events: readonly CoreEarningsEvent[] | null
}

const normalize = (ticker: string): string => ticker.trim().toUpperCase()

function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 10000) / 10000 : null
}

export function projectCoreEarnings(
  assets: readonly CoreEarningsAsset[],
  series: readonly CoreEarningsSeries[],
  from: string,
  to: string,
  updated: string | null = null,
) {
  if (!isCivilDate(from) || !isCivilDate(to) || from > to) {
    throw new RangeError('core Earnings window is invalid')
  }
  const eligible = assets.filter((asset): asset is CoreEarningsAsset & {
    kind: 'stock'; type: 'growth' | 'value' | 'reit'
  } => asset.kind === 'stock'
    && (asset.type === 'growth' || asset.type === 'value' || asset.type === 'reit'))
  const seriesByTicker = new Map(series.map(item => [normalize(item.ticker), item.events]))
  const earnings = [] as Array<{
    t: string; n: string; type: 'stock' | 'reit'; d: string; e: number | null; c: string | null
    lr?: { d: string; r: number | null; e: number | null; b: boolean | null }
  }>
  const missing: string[] = []
  let available = 0
  for (const asset of eligible) {
    const ticker = normalize(asset.ticker)
    const events = seriesByTicker.get(ticker)
    if (!events) {
      missing.push(ticker)
      continue
    }
    available += 1
    const valid = events.filter(event => isCivilDate(event.date))
    const next = valid
      .filter(event => event.date >= from && event.date <= to)
      .sort((left, right) => left.date.localeCompare(right.date))[0]
    if (!next) continue
    const last = valid
      .filter(event => event.date < from)
      .sort((left, right) => right.date.localeCompare(left.date))[0]
    const entry: typeof earnings[number] = {
      t: ticker,
      n: asset.name,
      type: asset.type === 'reit' ? 'reit' : 'stock',
      d: next.date,
      e: numberOrNull(next.epsEstimated),
      c: typeof asset.data?.currency === 'string' ? asset.data.currency : null,
    }
    if (last) {
      const actual = numberOrNull(last.epsActual ?? last.reportedEPS)
      const estimate = numberOrNull(last.epsEstimated)
      entry.lr = {
        d: last.date,
        r: actual,
        e: estimate,
        b: actual !== null && estimate !== null ? actual >= estimate : null,
      }
    }
    earnings.push(entry)
  }
  earnings.sort((left, right) => left.d.localeCompare(right.d) || left.t.localeCompare(right.t))
  return {
    updated,
    window: { from, to },
    count: earnings.length,
    earnings,
    coverage: { eligible: eligible.length, available, missing },
  }
}
