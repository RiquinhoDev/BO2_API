export type ProviderKey = 'hotmart' | 'curseduca' | 'guru'
export type DimensionKey = 'activation' | 'engagement' | 'journey' | 'consistency' | 'retention' | 'commercial'
export type ObservationQuality = 'observed' | 'missing' | 'stale' | 'invalid' | 'not_supported'

export interface MetricObservation {
  observationKey: string
  learnerId: string | null
  productId: string
  provider: ProviderKey
  metricKey: string
  dimension: DimensionKey
  normalizedValue: number | null
  nativeValue?: unknown
  sourceIdentity: string
  sourceEventAt: Date
  collectedAt: Date
  quality: ObservationQuality
  adapterVersion: string
}

export function buildMetricObservation(input: MetricObservation): MetricObservation {
  if (!input.observationKey.trim() || !input.productId.trim() || !input.metricKey.trim()) {
    throw new Error('observation identity is required')
  }
  if (input.quality !== 'observed' && input.normalizedValue !== null) {
    throw new Error('non-observed metrics require null normalizedValue')
  }
  if (input.quality === 'observed'
    && (input.normalizedValue === null || !Number.isFinite(input.normalizedValue)
      || input.normalizedValue < 0 || input.normalizedValue > 100)) {
    throw new Error('normalizedValue must be between 0 and 100')
  }
  return { ...input }
}

export interface SignalDefinition {
  metricKey: string
  dimension: DimensionKey
  weight: number
  reliability: number
}

export interface DimensionDefinition {
  dimension: DimensionKey
  weight: number
  signals: readonly SignalDefinition[]
}

export interface ScoreDefinitionContract {
  profileKey: string
  version: string
  experimental: true
  enabled: false
  minimumCoverage: number
  dimensions: readonly DimensionDefinition[]
}

export interface DimensionScore {
  score: number | null
  coverage: number
  missingSignals: string[]
}

export interface ScoreResult {
  score: number | null
  dimensions: Partial<Record<DimensionKey, DimensionScore>>
  coverage: number
  freshness: 'fresh' | 'stale' | 'partial'
  version: string
  experimental: true
  eligibleForRank: false
  actionState: 'indeterminate'
  reasons: string[]
  missingSignals: string[]
}
