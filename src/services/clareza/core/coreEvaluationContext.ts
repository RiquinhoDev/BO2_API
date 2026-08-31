import { medianFinite } from './coreValuation'

export type ValuationMetric = 'pe' | 'ps' | 'pb' | 'evEbitda' | 'pFfo'

export interface SectorContextItem {
  readonly ticker: string
  readonly sector: string
  readonly bucket: string
  readonly metrics: Readonly<Partial<Record<ValuationMetric, number | null>>>
}

export interface SectorMedianGroup {
  readonly value: number
  readonly sampleSize: number
}

export interface SectorContext {
  readonly groups: Readonly<Record<string, SectorMedianGroup>>
}

export interface ResolvedSectorMedian extends SectorMedianGroup {
  readonly source: 'sector-bucket' | 'sector'
}

const METRICS: readonly ValuationMetric[] = ['pe', 'ps', 'pb', 'evEbitda', 'pFfo']
const groupKey = (sector: string, bucket: string, metric: ValuationMetric): string => (
  JSON.stringify([sector, bucket, metric])
)

export function buildSectorContext(items: readonly SectorContextItem[]): SectorContext {
  const samples = new Map<string, number[]>()
  for (const item of items) {
    for (const metric of METRICS) {
      const value = item.metrics[metric]
      if (value === null || value === undefined || !Number.isFinite(value) || value <= 0 || value > 300) {
        continue
      }
      for (const key of [groupKey(item.sector, item.bucket, metric), groupKey(item.sector, '*', metric)]) {
        const values = samples.get(key) ?? []
        values.push(value)
        samples.set(key, values)
      }
    }
  }
  const groups: Record<string, SectorMedianGroup> = {}
  for (const key of [...samples.keys()].sort()) {
    const values = samples.get(key) ?? []
    if (values.length < 4) continue
    const value = medianFinite(values)
    if (value !== null) groups[key] = { value, sampleSize: values.length }
  }
  return { groups }
}

export function resolveSectorMedian(
  context: SectorContext,
  sector: string,
  bucket: string,
  metric: ValuationMetric,
): ResolvedSectorMedian | null {
  const exact = context.groups[groupKey(sector, bucket, metric)]
  if (exact) return { ...exact, source: 'sector-bucket' }
  const fallback = context.groups[groupKey(sector, '*', metric)]
  return fallback ? { ...fallback, source: 'sector' } : null
}

export function percentileRank(score: number, allScores: readonly number[]): number | null {
  const finite = allScores.filter(Number.isFinite)
  if (!Number.isFinite(score) || finite.length < 5) return null
  const less = finite.filter(candidate => candidate < score).length
  const equal = finite.filter(candidate => candidate === score).length
  return ((less + 0.5 * equal) / finite.length) * 100
}

export function radarRank(
  verdictKey: string,
  valuationScore: number | null,
  qualityScore: number | null,
): number | null {
  if (!['barata-excelente', 'barata-boa'].includes(verdictKey)) return null
  if (valuationScore === null || qualityScore === null) return null
  if (!Number.isFinite(valuationScore) || !Number.isFinite(qualityScore)) return null
  return Math.round((0.65 * valuationScore + 0.35 * qualityScore) * 10) / 10
}
