import type {
  DimensionKey,
  DimensionScore,
  MetricObservation,
  ScoreDefinitionContract,
  ScoreResult,
  SignalDefinition,
} from './contracts'

export interface DimensionCalculationInput {
  expectedSignals: readonly SignalDefinition[]
  observations: readonly MetricObservation[]
}

export interface ScoreCalculationInput {
  definition: ScoreDefinitionContract
  dimensions: Partial<Record<DimensionKey, DimensionScore>>
  observedCoverage: number
  freshness: ScoreResult['freshness']
}

const signalKey = (dimension: DimensionKey, metricKey: string): string => `${dimension}:${metricKey}`

export function calculateDimensionScore(input: DimensionCalculationInput): DimensionScore {
  const expectedWeight = input.expectedSignals.reduce((sum, signal) => sum + signal.weight, 0)
  const bySignal = new Map(input.observations.map(item => [signalKey(item.dimension, item.metricKey), item]))
  const observed = input.expectedSignals.flatMap(signal => {
    const observation = bySignal.get(signalKey(signal.dimension, signal.metricKey))
    return observation?.quality === 'observed' && observation.normalizedValue !== null
      ? [{ signal, value: observation.normalizedValue }]
      : []
  })
  const observedWeight = observed.reduce((sum, item) => sum + item.signal.weight, 0)
  const effectiveWeight = observed.reduce((sum, item) => sum + item.signal.weight * item.signal.reliability, 0)
  const score = effectiveWeight === 0 ? null : Math.round(
    observed.reduce((sum, item) => sum + item.value * item.signal.weight * item.signal.reliability, 0)
      / effectiveWeight,
  )
  return {
    score,
    coverage: expectedWeight === 0 ? 0 : Math.round(observedWeight * 100 / expectedWeight),
    missingSignals: input.expectedSignals.filter(signal => !observed.some(item => item.signal.metricKey === signal.metricKey)).map(signal => signal.metricKey),
  }
}

export function calculateScore(input: ScoreCalculationInput): ScoreResult {
  const configuredWeight = input.definition.dimensions.reduce((sum, item) => sum + item.weight, 0)
  if (configuredWeight !== 100) throw new Error('dimension weights must total 100')
  const missingDimensions = input.definition.dimensions.filter(item => input.dimensions[item.dimension]?.score === null
    || input.dimensions[item.dimension]?.score === undefined)
  const enoughCoverage = input.observedCoverage >= input.definition.minimumCoverage
  const score = enoughCoverage && missingDimensions.length === 0
    ? Math.round(input.definition.dimensions.reduce(
      (sum, item) => sum + (input.dimensions[item.dimension]?.score ?? 0) * item.weight,
      0,
    ) / 100)
    : null
  const missingSignals = [...new Set(Object.values(input.dimensions).flatMap(item => item?.missingSignals ?? []))]
  return {
    score,
    dimensions: input.dimensions,
    coverage: input.observedCoverage,
    freshness: input.freshness,
    version: input.definition.version,
    experimental: true,
    eligibleForRank: false,
    actionState: 'indeterminate',
    reasons: score === null ? ['insufficient_evidence'] : [],
    missingSignals,
  }
}
