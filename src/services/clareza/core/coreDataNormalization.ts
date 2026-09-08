import type { CoreAssetKind } from './coreGeneration.types'

export type NormalizedMetricStatus = 'available' | 'missing' | 'invalid'
export type NormalizedScalarUnit = 'ratio' | 'percent' | 'count'

export interface NormalizedScalarMetric {
  readonly status: NormalizedMetricStatus
  readonly unit: NormalizedScalarUnit
  readonly value: number | null
}

export interface NormalizedAmountMetric {
  readonly status: NormalizedMetricStatus
  readonly unit: 'amount'
  readonly value: number | null
  readonly currency: string | null
}

export interface PriceHistoryInput {
  readonly date: unknown
  readonly close: unknown
}

export interface CoreAssetSnapshotInput {
  readonly ticker: string
  readonly kind: CoreAssetKind
  readonly asOf: unknown
  readonly currency: unknown
  readonly price: unknown
  readonly changePercentage: unknown
  readonly dividendYieldFraction: unknown
  readonly pe: unknown
  readonly history: readonly PriceHistoryInput[]
  readonly periodStart: string
  readonly periodEnd: string
}

export interface NormalizedCoreAssetSnapshot {
  readonly ticker: string
  readonly kind: CoreAssetKind
  readonly asOf: string | null
  readonly currency: string | null
  readonly historyCoverage: {
    readonly validPoints: number
    readonly invalidPoints: number
  }
  readonly metrics: {
    readonly price: NormalizedAmountMetric
    readonly change: NormalizedScalarMetric
    readonly dividendYield: NormalizedScalarMetric
    readonly pe: NormalizedScalarMetric
    readonly performance12m: NormalizedScalarMetric
  }
}

interface NormalizedPricePoint {
  readonly date: string
  readonly close: number
}

export interface NormalizedPriceHistory {
  readonly points: readonly NormalizedPricePoint[]
  readonly invalidPoints: number
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function normalizeNumber(
  value: unknown,
  unit: NormalizedScalarUnit,
  multiplier = 1,
): NormalizedScalarMetric {
  if (value === null || value === undefined) return { status: 'missing', unit, value: null }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: 'invalid', unit, value: null }
  }
  return { status: 'available', unit, value: round(value * multiplier) }
}

function normalizeAmount(value: unknown, currency: string | null): NormalizedAmountMetric {
  const normalized = normalizeNumber(value, 'count')
  return {
    status: normalized.status,
    unit: 'amount',
    value: normalized.value,
    currency,
  }
}

export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const currency = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? value
    : null
}

export function normalizePriceHistory(
  history: readonly PriceHistoryInput[],
): NormalizedPriceHistory {
  const points: NormalizedPricePoint[] = []
  let invalidPoints = 0
  for (const point of history) {
    const date = normalizeDate(point.date)
    if (!date || typeof point.close !== 'number' || !Number.isFinite(point.close)) {
      invalidPoints += 1
      continue
    }
    points.push({ date, close: point.close })
  }
  points.sort((left, right) => left.date.localeCompare(right.date))
  return { points, invalidPoints }
}

export function calculatePeriodPerformance(
  history: readonly PriceHistoryInput[],
  periodStart: string,
  periodEnd: string,
): NormalizedScalarMetric {
  if (!normalizeDate(periodStart) || !normalizeDate(periodEnd) || periodStart >= periodEnd) {
    return { status: 'invalid', unit: 'percent', value: null }
  }

  const points = normalizePriceHistory(history).points
    .filter(point => point.date >= periodStart && point.date <= periodEnd)

  if (points.length < 2) return { status: 'missing', unit: 'percent', value: null }
  const first = points[0]
  const last = points[points.length - 1]
  if (first.date === last.date || first.close === 0) {
    return { status: 'invalid', unit: 'percent', value: null }
  }
  return normalizeNumber(((last.close - first.close) / first.close) * 100, 'percent')
}

export function normalizeCoreAssetSnapshot(
  input: CoreAssetSnapshotInput,
): NormalizedCoreAssetSnapshot {
  const currency = normalizeCurrency(input.currency)
  const normalizedHistory = normalizePriceHistory(input.history)
  return {
    ticker: input.ticker.trim().toUpperCase(),
    kind: input.kind,
    asOf: normalizeDate(input.asOf),
    currency,
    historyCoverage: {
      validPoints: normalizedHistory.points.length,
      invalidPoints: normalizedHistory.invalidPoints,
    },
    metrics: {
      price: normalizeAmount(input.price, currency),
      change: normalizeNumber(input.changePercentage, 'percent'),
      dividendYield: normalizeNumber(input.dividendYieldFraction, 'percent', 100),
      pe: normalizeNumber(input.pe, 'ratio'),
      performance12m: calculatePeriodPerformance(
        input.history,
        input.periodStart,
        input.periodEnd,
      ),
    },
  }
}
