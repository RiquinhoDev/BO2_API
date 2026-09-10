import mongoose from 'mongoose'
import {
  MetricObservation,
  ProductWeeklySnapshot,
  ScoreDefinition,
  StudentProductWeeklySnapshot,
} from '../../src/models'

const observationFields = {
  observationKey: 'hotmart:user-1:ogi:access-count:2026-09-07:v1',
  learnerId: new mongoose.Types.ObjectId(),
  productId: new mongoose.Types.ObjectId(),
  provider: 'hotmart' as const,
  metricKey: 'access_count',
  dimension: 'engagement' as const,
  sourceIdentity: 'user-1',
  sourceEventAt: new Date('2026-09-07T00:00:00.000Z'),
  collectedAt: new Date('2026-09-08T00:00:00.000Z'),
  adapterVersion: 'hotmart-v1',
}

describe('product scoring model topology', () => {
  test('exports stable model identities without recompilation errors', () => {
    expect(MetricObservation.modelName).toBe('MetricObservation')
    expect(StudentProductWeeklySnapshot.modelName).toBe('StudentProductWeeklySnapshot')
    expect(ProductWeeklySnapshot.modelName).toBe('ProductWeeklySnapshot')
    expect(ScoreDefinition.modelName).toBe('ScoreDefinition')

    expect(mongoose.models.MetricObservation).toBe(MetricObservation)
    expect(mongoose.models.StudentProductWeeklySnapshot).toBe(StudentProductWeeklySnapshot)
    expect(mongoose.models.ProductWeeklySnapshot).toBe(ProductWeeklySnapshot)
    expect(mongoose.models.ScoreDefinition).toBe(ScoreDefinition)
  })

  test('declares the observation idempotency index', () => {
    expect(MetricObservation.schema.indexes()).toEqual(expect.arrayContaining([
      [{ observationKey: 1 }, expect.objectContaining({ unique: true, name: 'metric_observation_key_unique' })],
    ]))
  })

  test('declares the learner weekly snapshot idempotency index', () => {
    expect(StudentProductWeeklySnapshot.schema.indexes()).toEqual(expect.arrayContaining([
      [
        { learnerId: 1, productId: 1, isoWeek: 1, scoreVersion: 1 },
        expect.objectContaining({ unique: true, name: 'student_product_week_score_version_unique' }),
      ],
    ]))
  })

  test('declares the product weekly snapshot idempotency index', () => {
    expect(ProductWeeklySnapshot.schema.indexes()).toEqual(expect.arrayContaining([
      [
        { productId: 1, isoWeek: 1, scoreVersion: 1 },
        expect.objectContaining({ unique: true, name: 'product_week_score_version_unique' }),
      ],
    ]))
  })

  test('declares the score definition version index', () => {
    expect(ScoreDefinition.schema.indexes()).toEqual(expect.arrayContaining([
      [{ profileKey: 1, version: 1 }, expect.objectContaining({ unique: true, name: 'score_profile_version_unique' })],
    ]))
  })

  test('preserves observed zero and rejects numeric non-observed values', async () => {
    const observedZero = new MetricObservation({
      ...observationFields,
      normalizedValue: 0,
      quality: 'observed',
    })
    await expect(observedZero.validate()).resolves.toBeUndefined()

    const invalidMissing = new MetricObservation({
      ...observationFields,
      normalizedValue: 0,
      quality: 'missing',
    })
    await expect(invalidMissing.validate()).rejects.toThrow('observation quality/value mismatch')
  })

  test('rejects a non-experimental product snapshot', async () => {
    const invalidSnapshot = new ProductWeeklySnapshot({
      productId: new mongoose.Types.ObjectId(),
      isoWeek: '2026-W37',
      scoreVersion: '1.0-experimental',
      profileKey: 'product-health',
      score: null,
      learnerCount: 0,
      eligibleLearnerCount: 0,
      coverage: 0,
      distribution: {},
      experimental: false,
    })

    await expect(invalidSnapshot.validate()).rejects.toMatchObject({
      errors: { experimental: { message: 'experimental must be true' } },
    })
  })

  test('rejects non-experimental or rank-eligible learner snapshots', async () => {
    const baseSnapshot = {
      learnerId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      isoWeek: '2026-W37',
      scoreVersion: '1.0-experimental',
      profileKey: 'learner-course',
      score: null,
      dimensions: {},
      coverage: 0,
      freshness: 'fresh' as const,
      reasons: [],
      missingSignals: [],
    }

    const nonExperimental = new StudentProductWeeklySnapshot({
      ...baseSnapshot,
      experimental: false,
      eligibleForRank: false,
      actionState: 'indeterminate',
    })
    await expect(nonExperimental.validate()).rejects.toMatchObject({
      errors: { experimental: { message: 'experimental must be true' } },
    })

    const rankEligible = new StudentProductWeeklySnapshot({
      ...baseSnapshot,
      experimental: true,
      eligibleForRank: true,
      actionState: 'indeterminate',
    })
    await expect(rankEligible.validate()).rejects.toMatchObject({
      errors: { eligibleForRank: { message: 'eligibleForRank must be false' } },
    })
  })

  test('rejects an enabled or non-experimental score definition', async () => {
    const baseDefinition = {
      profileKey: 'learner-course',
      version: '1.0-experimental',
      minimumCoverage: 70,
      dimensions: [],
    }

    const nonExperimental = new ScoreDefinition({
      ...baseDefinition,
      experimental: false,
      enabled: false,
    })
    await expect(nonExperimental.validate()).rejects.toMatchObject({
      errors: { experimental: { message: 'experimental must be true' } },
    })

    const enabled = new ScoreDefinition({
      ...baseDefinition,
      experimental: true,
      enabled: true,
    })
    await expect(enabled.validate()).rejects.toMatchObject({
      errors: { enabled: { message: 'enabled must be false' } },
    })
  })
})
