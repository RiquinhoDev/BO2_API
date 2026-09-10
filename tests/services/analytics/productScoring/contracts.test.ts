import { buildMetricObservation } from '../../../../src/services/analytics/productScoring/contracts'

const base = {
  observationKey: 'hotmart:user-1:ogi:access-count:2026-09-07:v1',
  learnerId: '507f1f77bcf86cd799439011',
  productId: '507f191e810c19729de860ea',
  provider: 'hotmart' as const,
  metricKey: 'access_count',
  dimension: 'engagement' as const,
  sourceIdentity: 'user-1',
  sourceEventAt: new Date('2026-09-07T00:00:00.000Z'),
  collectedAt: new Date('2026-09-08T00:00:00.000Z'),
  adapterVersion: 'hotmart-v1',
}

test('preserves an observed zero as real evidence', () => {
  expect(buildMetricObservation({ ...base, quality: 'observed', normalizedValue: 0 }).normalizedValue).toBe(0)
})

test('preserves a missing signal as null', () => {
  expect(buildMetricObservation({ ...base, quality: 'missing', normalizedValue: null }).normalizedValue).toBeNull()
})

test('rejects missing evidence carrying a numeric value', () => {
  expect(() => buildMetricObservation({ ...base, quality: 'missing', normalizedValue: 0 })).toThrow('non-observed metrics require null normalizedValue')
})

test('rejects observed values outside zero to one hundred', () => {
  expect(() => buildMetricObservation({ ...base, quality: 'observed', normalizedValue: 101 })).toThrow('normalizedValue must be between 0 and 100')
})
