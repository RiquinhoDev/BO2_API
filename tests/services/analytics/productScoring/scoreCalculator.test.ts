import type {
  DimensionDefinition,
  DimensionKey,
  DimensionScore,
  MetricObservation,
  ScoreDefinitionContract,
} from '../../../../src/services/analytics/productScoring/contracts'
import { calculateDimensionScore, calculateScore } from '../../../../src/services/analytics/productScoring/scoreCalculator'

const observed = (metricKey: string, normalizedValue: number): MetricObservation => ({
  observationKey: `test:${metricKey}`,
  learnerId: '507f1f77bcf86cd799439011',
  productId: '507f191e810c19729de860ea',
  provider: 'hotmart',
  metricKey,
  dimension: 'engagement',
  normalizedValue,
  sourceIdentity: 'test-user',
  sourceEventAt: new Date('2026-09-07T00:00:00.000Z'),
  collectedAt: new Date('2026-09-08T00:00:00.000Z'),
  quality: 'observed',
  adapterVersion: 'test-v1',
})

const missing = (metricKey: string): MetricObservation => ({
  ...observed(metricKey, 0),
  normalizedValue: null,
  quality: 'missing',
})

const dimension = (
  dimensionKey: DimensionKey,
  score: number,
  weight: number,
): { definition: DimensionDefinition; result: DimensionScore } => ({
  definition: { dimension: dimensionKey, weight, signals: [] },
  result: { score, coverage: 100, missingSignals: [] },
})

const fixtureInput = (overrides: {
  minimumCoverage?: number
  observedCoverage?: number
  dimensions?: ReturnType<typeof dimension>[]
} = {}) => {
  const dimensions = overrides.dimensions ?? [dimension('engagement', 80, 100)]
  const definition: ScoreDefinitionContract = {
    profileKey: 'learner-course',
    version: '1.0-experimental',
    experimental: true,
    enabled: false,
    minimumCoverage: overrides.minimumCoverage ?? 70,
    dimensions: dimensions.map(item => item.definition),
  }
  return {
    definition,
    dimensions: Object.fromEntries(dimensions.map(item => [item.definition.dimension, item.result])),
    observedCoverage: overrides.observedCoverage ?? 100,
    freshness: 'fresh' as const,
  }
}

test('does not count missing evidence as zero', () => {
  const result = calculateDimensionScore({
    expectedSignals: [
      { metricKey: 'access_recency', dimension: 'engagement', weight: 60, reliability: 1 },
      { metricKey: 'access_frequency', dimension: 'engagement', weight: 40, reliability: 1 },
    ],
    observations: [observed('access_recency', 80), missing('access_frequency')],
  })
  expect(result.score).toBe(80)
  expect(result.coverage).toBe(60)
  expect(result.missingSignals).toEqual(['access_frequency'])
})

test('keeps a real observed zero in the weighted score', () => {
  const result = calculateDimensionScore({
    expectedSignals: [{ metricKey: 'access_frequency', dimension: 'engagement', weight: 100, reliability: 1 }],
    observations: [observed('access_frequency', 0)],
  })
  expect(result).toMatchObject({ score: 0, coverage: 100 })
})

test('withholds the internal score below minimum coverage', () => {
  const result = calculateScore(fixtureInput({ minimumCoverage: 70, observedCoverage: 60 }))
  expect(result).toMatchObject({ score: null, eligibleForRank: false, actionState: 'indeterminate', experimental: true })
})

test('calculates the weighted score without runtime weight redistribution', () => {
  const result = calculateScore(fixtureInput({
    minimumCoverage: 70,
    dimensions: [dimension('engagement', 80, 60), dimension('journey', 50, 40)],
  }))
  expect(result.score).toBe(68)
})
