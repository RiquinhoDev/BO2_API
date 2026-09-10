# Canonical Product Scoring Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-independent scoring foundation that preserves missingness, calculates deterministic dimension scores, persists versioned weekly snapshots, and can run entirely against in-memory adapters before any real provider integration.

**Architecture:** A deep product-scoring module exposes one canonical observation interface and one weekly calculation interface. Pure calculation stays separate from Mongoose adapters; provider adapters, scheduler activation, HTTP routes, Front changes, and Discord remain outside this plan.

**Tech Stack:** Node.js, TypeScript 5.9, Mongoose 8, Jest 29, ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-10-canonical-product-scoring-design.md`

## Global Constraints

- Work only in `BO2_API_remake` on branch `remake`.
- Missing data is never equivalent to zero.
- Discord is excluded; its future design must inspect the separate bot API and ask the user before assumptions.
- Do not call Hotmart, CursEduca, Guru, Discord, Mongo production, or Railway.
- Do not register or enable a cron job in this plan.
- Do not add HTTP routes or change the Front in this plan.
- Formula definitions remain experimental; no definitive ranks or action states are emitted.
- Every task uses real RED/GREEN evidence, `git diff --check`, a focused commit, and push only under the user's standing ticket workflow.
- When uncertainty changes meaning, mapping, weights, thresholds, identity, or external behaviour: stop, present evidence and options, then ask the user.

## Follow-on Tickets — Not Authorized by This Plan

1. Hotmart adapter: verify current API payloads and map only evidenced signals.
2. CursEduca adapter: verify current API payloads and map shared plus provider-native signals.
3. Guru adapter: verify current API payloads and keep commercial/retention evidence separate from learning engagement.
4. Weekly scheduler and read API: reuse persisted provider data; do not trigger a second full provider synchronization.
5. Front read models and clean presentation after backend evidence is trustworthy.
6. Discord adapter last, under a new user-approved design after inspecting the separate bot API. Any doubt about bot history, permissions, intents, identity matching, guild/product scope, or legitimate signals is a mandatory question to the user, never an implementation assumption.

The 15-day calibration (day 0, day 7, day 15) starts only after the required real-provider adapters and weekly read path have their own approved tickets and evidence. Completing this foundation does not start that clock.

## File Structure

- `src/services/analytics/productScoring/contracts.ts`: canonical types and runtime validation.
- `src/services/analytics/productScoring/scoreCalculator.ts`: pure dimension, coverage, and internal-score calculation.
- `src/services/analytics/productScoring/weeklySnapshotRunner.ts`: provider-independent weekly orchestration through ports.
- `src/services/analytics/productScoring/index.ts`: narrow public interface for the module.
- `src/models/analytics/MetricObservation.ts`: provenance-preserving canonical observation model.
- `src/models/analytics/StudentProductWeeklySnapshot.ts`: learner/product/week/version snapshot model.
- `src/models/analytics/ProductWeeklySnapshot.ts`: product/week/version aggregate snapshot model.
- `src/models/analytics/ScoreDefinition.ts`: versioned experimental formula model.
- `src/services/analytics/productScoring/mongooseScoringRepository.ts`: Mongoose adapter for observation and snapshot persistence.
- `tests/services/analytics/productScoring/contracts.test.ts`: missingness and validation contract tests.
- `tests/services/analytics/productScoring/scoreCalculator.test.ts`: deterministic formula tests.
- `tests/models/productScoringModels.test.ts`: schema identity and unique-index tests.
- `tests/services/analytics/productScoring/mongooseScoringRepository.test.ts`: persistence-adapter behaviour tests.
- `tests/services/analytics/productScoring/weeklySnapshotRunner.test.ts`: orchestration, idempotency, and failure-isolation tests.

---

### Task 1: Canonical observation contract

**Files:**
- Create: `src/services/analytics/productScoring/contracts.ts`
- Create: `tests/services/analytics/productScoring/contracts.test.ts`

**Interfaces:**
- Consumes: no application modules.
- Produces: `ProviderKey`, `DimensionKey`, `ObservationQuality`, `MetricObservation`, `buildMetricObservation`, `ScoreDefinitionContract`, `DimensionScore`, and `ScoreResult`.

- [ ] **Step 1: Write the failing contract tests**

```ts
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
```

- [ ] **Step 2: Run the focused test and record RED**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement the canonical contract and runtime validation**

```ts
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
```

Add these exact public contracts to the same file. Do not add Discord to `ProviderKey` in this plan.

```ts
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
```

- [ ] **Step 4: Run focused GREEN and static checks**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/contracts.test.ts`

Expected: PASS, 4 tests.

Run: `npm.cmd run types:check`

Expected: exit 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/services/analytics/productScoring/contracts.ts tests/services/analytics/productScoring/contracts.test.ts
git diff --cached --check
git commit -m "feat(analytics): define scoring contracts"
git push origin remake
```

---

### Task 2: Pure score calculator

**Files:**
- Create: `src/services/analytics/productScoring/scoreCalculator.ts`
- Create: `tests/services/analytics/productScoring/scoreCalculator.test.ts`

**Interfaces:**
- Consumes: `MetricObservation`, `ScoreDefinitionContract`, `DimensionScore`, `ScoreResult` from Task 1.
- Produces: `calculateDimensionScore(input)` and `calculateScore(input)` as deterministic pure functions.

- [ ] **Step 1: Write failing score tests**

```ts
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
      { metricKey: 'access_recency', weight: 60, reliability: 1 },
      { metricKey: 'access_frequency', weight: 40, reliability: 1 },
    ],
    observations: [observed('access_recency', 80), missing('access_frequency')],
  })
  expect(result.score).toBe(80)
  expect(result.coverage).toBe(60)
  expect(result.missingSignals).toEqual(['access_frequency'])
})

test('keeps a real observed zero in the weighted score', () => {
  const result = calculateDimensionScore({
    expectedSignals: [{ metricKey: 'access_frequency', weight: 100, reliability: 1 }],
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
```

- [ ] **Step 2: Run the focused test and record RED**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/scoreCalculator.test.ts`

Expected: FAIL because `scoreCalculator.ts` does not exist.

- [ ] **Step 3: Implement deterministic calculation**

```ts
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

export function calculateDimensionScore(input: DimensionCalculationInput): DimensionScore {
  const expectedWeight = input.expectedSignals.reduce((sum, signal) => sum + signal.weight, 0)
  const byMetric = new Map(input.observations.map(item => [item.metricKey, item]))
  const observed = input.expectedSignals.flatMap(signal => {
    const observation = byMetric.get(signal.metricKey)
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
```

This foundation does not redistribute a missing dimension's weight and does not treat it as zero: if any configured dimension has no score, the internal score is `null`. `calculateScore` also keeps coverage separate from score and never emits a definitive action state or rank.

- [ ] **Step 4: Run focused GREEN and mutation regression**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/scoreCalculator.test.ts`

Expected: PASS, 4 tests.

Temporarily change the missing-observation branch to return numeric zero and rerun the focused test. Expected: the first test fails. Revert only that temporary mutation and rerun. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/analytics/productScoring/scoreCalculator.ts tests/services/analytics/productScoring/scoreCalculator.test.ts
git diff --cached --check
git commit -m "feat(analytics): calculate dimension scores"
git push origin remake
```

---

### Task 3: Versioned Mongoose models

**Files:**
- Create: `src/models/analytics/MetricObservation.ts`
- Create: `src/models/analytics/StudentProductWeeklySnapshot.ts`
- Create: `src/models/analytics/ProductWeeklySnapshot.ts`
- Create: `src/models/analytics/ScoreDefinition.ts`
- Modify: `src/models/index.ts`
- Create: `tests/models/productScoringModels.test.ts`

**Interfaces:**
- Consumes: canonical enum values from Task 1 without importing provider implementations.
- Produces: four Mongoose models with stable model identities and unique idempotency indexes.

- [ ] **Step 1: Write failing model topology tests**

```ts
import { MetricObservation, ProductWeeklySnapshot, ScoreDefinition, StudentProductWeeklySnapshot } from '../../src/models'

test('exports stable product scoring model identities', () => {
  expect(MetricObservation.modelName).toBe('MetricObservation')
  expect(StudentProductWeeklySnapshot.modelName).toBe('StudentProductWeeklySnapshot')
  expect(ProductWeeklySnapshot.modelName).toBe('ProductWeeklySnapshot')
  expect(ScoreDefinition.modelName).toBe('ScoreDefinition')
})

test('enforces weekly learner snapshot idempotency', () => {
  expect(StudentProductWeeklySnapshot.schema.indexes()).toContainEqual([
    { learnerId: 1, productId: 1, isoWeek: 1, scoreVersion: 1 },
    { unique: true, name: 'student_product_week_score_version_unique' },
  ])
})
```

Add equivalent assertions for `observationKey`, product/week/version, and profile/version unique indexes.

- [ ] **Step 2: Run the focused test and record RED**

Run: `npm.cmd run test:unit -- --runInBand tests/models/productScoringModels.test.ts`

Expected: FAIL because the models are not exported.

- [ ] **Step 3: Implement focused schemas and indexes**

Define the schemas with these exact required fields and validators:

```ts
const MetricObservationSchema = new Schema({
  observationKey: { type: String, required: true },
  learnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  provider: { type: String, enum: ['hotmart', 'curseduca', 'guru'], required: true },
  metricKey: { type: String, required: true },
  dimension: { type: String, enum: ['activation', 'engagement', 'journey', 'consistency', 'retention', 'commercial'], required: true },
  normalizedValue: { type: Number, min: 0, max: 100, default: null },
  nativeValue: { type: Schema.Types.Mixed, select: false },
  sourceIdentity: { type: String, required: true },
  sourceEventAt: { type: Date, required: true },
  collectedAt: { type: Date, required: true },
  quality: { type: String, enum: ['observed', 'missing', 'stale', 'invalid', 'not_supported'], required: true },
  adapterVersion: { type: String, required: true },
}, { timestamps: true })

MetricObservationSchema.pre('validate', function validateObservedValue(next) {
  const valid = this.quality === 'observed' ? this.normalizedValue !== null : this.normalizedValue === null
  next(valid ? undefined : new Error('observation quality/value mismatch'))
})

const StudentProductWeeklySnapshotSchema = new Schema({
  learnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  isoWeek: { type: String, required: true },
  scoreVersion: { type: String, required: true },
  profileKey: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: null },
  dimensions: { type: Schema.Types.Mixed, required: true },
  coverage: { type: Number, min: 0, max: 100, required: true },
  freshness: { type: String, enum: ['fresh', 'stale', 'partial'], required: true },
  experimental: { type: Boolean, enum: [true], required: true },
  eligibleForRank: { type: Boolean, enum: [false], required: true },
  actionState: { type: String, enum: ['indeterminate'], required: true },
  reasons: { type: [String], default: [] },
  missingSignals: { type: [String], default: [] },
}, { timestamps: true })

const ProductWeeklySnapshotSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  isoWeek: { type: String, required: true },
  scoreVersion: { type: String, required: true },
  profileKey: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: null },
  learnerCount: { type: Number, min: 0, required: true },
  eligibleLearnerCount: { type: Number, min: 0, required: true },
  coverage: { type: Number, min: 0, max: 100, required: true },
  distribution: { type: Schema.Types.Mixed, required: true },
  experimental: { type: Boolean, enum: [true], required: true },
}, { timestamps: true })

const ScoreDefinitionSchema = new Schema({
  profileKey: { type: String, required: true },
  version: { type: String, required: true },
  experimental: { type: Boolean, enum: [true], required: true },
  enabled: { type: Boolean, enum: [false], required: true },
  minimumCoverage: { type: Number, min: 0, max: 100, required: true },
  dimensions: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true })
```

Use these exact unique indexes:

```ts
MetricObservationSchema.index({ observationKey: 1 }, { unique: true, name: 'metric_observation_key_unique' })
StudentProductWeeklySnapshotSchema.index(
  { learnerId: 1, productId: 1, isoWeek: 1, scoreVersion: 1 },
  { unique: true, name: 'student_product_week_score_version_unique' },
)
ProductWeeklySnapshotSchema.index(
  { productId: 1, isoWeek: 1, scoreVersion: 1 },
  { unique: true, name: 'product_week_score_version_unique' },
)
ScoreDefinitionSchema.index(
  { profileKey: 1, version: 1 },
  { unique: true, name: 'score_profile_version_unique' },
)
```

All score definitions created by this plan require `experimental: true` and `enabled: false`. Export the models from `src/models/index.ts`; do not modify existing legacy analytics models.

- [ ] **Step 4: Run focused GREEN and type checks**

Run: `npm.cmd run test:unit -- --runInBand tests/models/productScoringModels.test.ts`

Expected: PASS.

Run: `npm.cmd run types:check`

Expected: exit 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/models/analytics src/models/index.ts tests/models/productScoringModels.test.ts
git diff --cached --check
git commit -m "feat(analytics): persist scoring snapshots"
git push origin remake
```

---

### Task 4: Mongoose scoring repository adapter

**Files:**
- Create: `src/services/analytics/productScoring/mongooseScoringRepository.ts`
- Create: `tests/services/analytics/productScoring/mongooseScoringRepository.test.ts`

**Interfaces:**
- Consumes: models from Task 3 and contracts from Task 1.
- Produces: `createMongooseScoringRepository(models)` implementing `upsertObservations`, `readObservations`, `readExperimentalDefinition`, `upsertStudentSnapshots`, and `upsertProductSnapshot`.

- [ ] **Step 1: Write failing adapter tests with injected model fakes**

```ts
import type { MetricObservation } from '../../../../src/services/analytics/productScoring/contracts'
import { createMongooseScoringRepository } from '../../../../src/services/analytics/productScoring/mongooseScoringRepository'

const observationFixture = (): MetricObservation => ({
  observationKey: 'hotmart:user-1:ogi:access-count:2026-09-07:v1',
  learnerId: '507f1f77bcf86cd799439011',
  productId: '507f191e810c19729de860ea',
  provider: 'hotmart',
  metricKey: 'access_count',
  dimension: 'engagement',
  normalizedValue: 80,
  sourceIdentity: 'user-1',
  sourceEventAt: new Date('2026-09-07T00:00:00.000Z'),
  collectedAt: new Date('2026-09-08T00:00:00.000Z'),
  quality: 'observed',
  adapterVersion: 'hotmart-v1',
})

const query = <T>(value: T) => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(value) }) })
const fakeModels = (overrides: {
  observationBulkWrite?: jest.Mock
  observationFind?: jest.Mock
  definition?: Record<string, unknown> | null
} = {}) => ({
  MetricObservation: {
    bulkWrite: overrides.observationBulkWrite ?? jest.fn(),
    find: overrides.observationFind ?? jest.fn(() => ({
      select: () => ({ limit: () => query([]) }),
    })),
  },
  ScoreDefinition: {
    findOne: jest.fn(() => query(overrides.definition ?? {
      profileKey: 'learner-course', version: '1.0-experimental', experimental: true, enabled: false,
    })),
  },
  StudentProductWeeklySnapshot: { bulkWrite: jest.fn() },
  ProductWeeklySnapshot: { updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })) },
})

test('bulk upserts observations by observationKey', async () => {
  const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite: bulkWrite }))
  await repository.upsertObservations([observationFixture()])
  expect(bulkWrite).toHaveBeenCalledWith([
    expect.objectContaining({
      updateOne: expect.objectContaining({
        filter: { observationKey: observationFixture().observationKey },
        upsert: true,
      }),
    }),
  ], { ordered: false })
})

test('refuses to load a non-experimental or enabled definition', async () => {
  const repository = createMongooseScoringRepository(fakeModels({ definition: { experimental: false, enabled: true } }))
  await expect(repository.readExperimentalDefinition('ogi-course', '1.0-experimental')).rejects.toThrow('foundation accepts disabled experimental definitions only')
})
```

Add these concrete tests for the remaining adapter requirements:

```ts
test('bounds reads by product and source-event window', async () => {
  const exec = jest.fn().mockResolvedValue([])
  const find = jest.fn(() => ({ select: () => ({ limit: () => ({ lean: () => ({ exec }) }) }) }))
  const repository = createMongooseScoringRepository(fakeModels({ observationFind: find }))
  await repository.readObservations({
    productId: '507f191e810c19729de860ea',
    from: new Date('2026-09-07T00:00:00.000Z'),
    to: new Date('2026-09-14T00:00:00.000Z'),
  })
  expect(find).toHaveBeenCalledWith({
    productId: '507f191e810c19729de860ea',
    sourceEventAt: { $gte: new Date('2026-09-07T00:00:00.000Z'), $lt: new Date('2026-09-14T00:00:00.000Z') },
  })
  expect(exec).toHaveBeenCalledTimes(1)
})

test('does not call bulkWrite for an empty observation list', async () => {
  const bulkWrite = jest.fn()
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite: bulkWrite }))
  await expect(repository.upsertObservations([])).resolves.toEqual({ inserted: 0, updated: 0 })
  expect(bulkWrite).not.toHaveBeenCalled()
})

test('rejects input beyond the twenty-thousand item cap before persistence', async () => {
  const bulkWrite = jest.fn()
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite: bulkWrite }))
  await expect(repository.upsertObservations(Array.from({ length: 20_001 }, observationFixture))).rejects.toThrow('SCORING_CAPACITY_EXCEEDED')
  expect(bulkWrite).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and record RED**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/mongooseScoringRepository.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter with injected models**

```ts
import type { MetricObservation, ScoreDefinitionContract } from './contracts'

export interface ObservationWindow {
  productId: string
  from: Date
  to: Date
}

export interface PersistenceSummary {
  inserted: number
  updated: number
}

export interface StudentSnapshotPersistence {
  learnerId: string
  productId: string
  isoWeek: string
  scoreVersion: string
  [key: string]: unknown
}

export interface ProductSnapshotPersistence {
  productId: string
  isoWeek: string
  scoreVersion: string
  [key: string]: unknown
}

type QueryResult<T> = { lean(): { exec(): Promise<T> } }
type ObservationFindResult = { select(selection: string): { limit(count: number): QueryResult<MetricObservation[]> } }

export interface ScoringModels {
  MetricObservation: {
    bulkWrite(operations: unknown[], options: { ordered: false }): Promise<{ upsertedCount: number; modifiedCount: number }>
    find(filter: unknown): ObservationFindResult
  }
  ScoreDefinition: {
    findOne(filter: unknown): QueryResult<ScoreDefinitionContract | null>
  }
  StudentProductWeeklySnapshot: {
    bulkWrite(operations: unknown[], options: { ordered: false }): Promise<{ upsertedCount: number; modifiedCount: number }>
  }
  ProductWeeklySnapshot: {
    updateOne(filter: unknown, update: unknown, options: { upsert: true }): { exec(): Promise<unknown> }
  }
}

export interface ScoringRepository {
  upsertObservations(observations: readonly MetricObservation[]): Promise<PersistenceSummary>
  readObservations(window: ObservationWindow): Promise<MetricObservation[]>
  readExperimentalDefinition(profileKey: string, version: string): Promise<ScoreDefinitionContract>
  upsertStudentSnapshots(snapshots: readonly StudentSnapshotPersistence[]): Promise<PersistenceSummary>
  upsertProductSnapshot(snapshot: ProductSnapshotPersistence): Promise<void>
}

export class ScoringCapacityError extends Error {
  constructor(count: number) {
    super(`SCORING_CAPACITY_EXCEEDED:${count}`)
    this.name = 'ScoringCapacityError'
  }
}

const assertScoringCapacity = (count: number): void => {
  if (count > 20_000) throw new ScoringCapacityError(count)
}

const writeStudentSnapshots = async (
  model: ScoringModels['StudentProductWeeklySnapshot'],
  snapshots: readonly StudentSnapshotPersistence[],
): Promise<PersistenceSummary> => {
  const result = await model.bulkWrite(snapshots.map(snapshot => ({
    updateOne: {
      filter: {
        learnerId: snapshot.learnerId,
        productId: snapshot.productId,
        isoWeek: snapshot.isoWeek,
        scoreVersion: snapshot.scoreVersion,
      },
      update: { $set: snapshot },
      upsert: true,
    },
  })), { ordered: false })
  return { inserted: result.upsertedCount, updated: result.modifiedCount }
}

export function createMongooseScoringRepository(models: ScoringModels): ScoringRepository {
  return {
    async upsertObservations(observations) {
      assertScoringCapacity(observations.length)
      if (observations.length === 0) return { inserted: 0, updated: 0 }
      const result = await models.MetricObservation.bulkWrite(
        observations.map(observation => ({
          updateOne: {
            filter: { observationKey: observation.observationKey },
            update: { $set: observation },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      return { inserted: result.upsertedCount, updated: result.modifiedCount }
    },
    async readObservations({ productId, from, to }) {
      return models.MetricObservation.find({ productId, sourceEventAt: { $gte: from, $lt: to } })
        .select('-nativeValue')
        .limit(20_000)
        .lean()
        .exec()
    },
    async readExperimentalDefinition(profileKey, version) {
      const definition = await models.ScoreDefinition.findOne({ profileKey, version }).lean().exec()
      if (!definition || definition.experimental !== true || definition.enabled !== false) {
        throw new Error('foundation accepts disabled experimental definitions only')
      }
      return definition
    },
    async upsertStudentSnapshots(snapshots) {
      assertScoringCapacity(snapshots.length)
      if (snapshots.length === 0) return { inserted: 0, updated: 0 }
      return writeStudentSnapshots(models.StudentProductWeeklySnapshot, snapshots)
    },
    async upsertProductSnapshot(snapshot) {
      assertScoringCapacity(1)
      await models.ProductWeeklySnapshot.updateOne(
        { productId: snapshot.productId, isoWeek: snapshot.isoWeek, scoreVersion: snapshot.scoreVersion },
        { $set: snapshot },
        { upsert: true },
      ).exec()
    },
  }
}
```

The two array entry points enforce the `20_000` cap before calling Mongoose. Reads use `.limit(20_000)`. Do not expose raw native values in return summaries.

- [ ] **Step 4: Run focused GREEN**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/mongooseScoringRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/services/analytics/productScoring/mongooseScoringRepository.ts tests/services/analytics/productScoring/mongooseScoringRepository.test.ts
git diff --cached --check
git commit -m "feat(analytics): add scoring repository"
git push origin remake
```

---

### Task 5: Provider-independent weekly snapshot runner

**Files:**
- Create: `src/services/analytics/productScoring/weeklySnapshotRunner.ts`
- Create: `src/services/analytics/productScoring/index.ts`
- Create: `tests/services/analytics/productScoring/weeklySnapshotRunner.test.ts`

**Interfaces:**
- Consumes: `ScoringRepository`, `calculateScore`, a `Clock`, and an array of `ProviderMetricsAdapter` instances supplied by the caller.
- Produces: `createWeeklySnapshotRunner(dependencies).run(request): Promise<WeeklySnapshotRunResult>`.

- [ ] **Step 1: Write failing orchestration tests**

```ts
import type { MetricObservation, ProviderKey, ScoreDefinitionContract } from '../../../../src/services/analytics/productScoring/contracts'
import type { ScoringRepository, StudentSnapshotPersistence } from '../../../../src/services/analytics/productScoring/mongooseScoringRepository'
import {
  createWeeklySnapshotRunner,
  type ProviderMetricsAdapter,
  type WeeklySnapshotDependencies,
  type WeeklySnapshotRequest,
} from '../../../../src/services/analytics/productScoring/weeklySnapshotRunner'

const request: WeeklySnapshotRequest = {
  productId: '507f191e810c19729de860ea',
  profileKey: 'learner-course',
  isoWeek: '2026-W37',
  scoreVersion: '1.0-experimental',
  from: new Date('2026-09-07T00:00:00.000Z'),
  to: new Date('2026-09-14T00:00:00.000Z'),
}

const definition = (minimumCoverage = 70): ScoreDefinitionContract => ({
  profileKey: 'learner-course',
  version: '1.0-experimental',
  experimental: true,
  enabled: false,
  minimumCoverage,
  dimensions: [{
    dimension: 'engagement',
    weight: 100,
    signals: [{ metricKey: 'access_count', dimension: 'engagement', weight: 100, reliability: 1 }],
  }],
})

const observation = (quality: 'observed' | 'missing' = 'observed'): MetricObservation => ({
  observationKey: `hotmart:user-1:ogi:access-count:2026-W37:${quality}`,
  learnerId: '507f1f77bcf86cd799439011',
  productId: request.productId,
  provider: 'hotmart',
  metricKey: 'access_count',
  dimension: 'engagement',
  normalizedValue: quality === 'observed' ? 80 : null,
  sourceIdentity: 'user-1',
  sourceEventAt: request.from,
  collectedAt: new Date('2026-09-14T01:00:00.000Z'),
  quality,
  adapterVersion: 'test-v1',
})

const adapter = (provider: ProviderKey, mode: 'success' | 'failure', quality: 'observed' | 'missing' = 'observed'): ProviderMetricsAdapter => ({
  provider,
  async collect() {
    if (mode === 'failure') throw new Error('provider unavailable')
    return { provider, observations: [{ ...observation(quality), provider }], durationMs: 10 }
  },
})

const dependencies = (
  adapters: ProviderMetricsAdapter[],
  minimumCoverage = 70,
): WeeklySnapshotDependencies & { storedStudentSnapshots: Map<string, StudentSnapshotPersistence> } => {
  const storedStudentSnapshots = new Map<string, StudentSnapshotPersistence>()
  const repository: ScoringRepository = {
    upsertObservations: jest.fn(async rows => ({ inserted: rows.length, updated: 0 })),
    readObservations: jest.fn(async () => []),
    readExperimentalDefinition: jest.fn(async () => definition(minimumCoverage)),
    upsertStudentSnapshots: jest.fn(async rows => {
      rows.forEach(row => storedStudentSnapshots.set(
        `${row.learnerId}:${row.productId}:${row.isoWeek}:${row.scoreVersion}`,
        row,
      ))
      return { inserted: rows.length, updated: 0 }
    }),
    upsertProductSnapshot: jest.fn(async () => undefined),
  }
  return { adapters, repository, clock: { now: () => new Date('2026-09-14T01:00:00.000Z') }, storedStudentSnapshots }
}

test('isolates one adapter failure and marks the run partial', async () => {
  const runner = createWeeklySnapshotRunner(dependencies([
    adapter('hotmart', 'success'), adapter('curseduca', 'failure'),
  ]))
  const result = await runner.run(request)
  expect(result.status).toBe('partial')
  expect(result.providers).toEqual([
    expect.objectContaining({ provider: 'hotmart', status: 'complete' }),
    expect.objectContaining({ provider: 'curseduca', status: 'failed' }),
  ])
})

test('reruns the same week and version through idempotent upserts', async () => {
  const deps = dependencies([adapter('hotmart', 'success')])
  const runner = createWeeklySnapshotRunner(deps)
  await runner.run(request)
  await runner.run(request)
  expect(deps.repository.upsertStudentSnapshots).toHaveBeenCalledTimes(2)
  expect(deps.storedStudentSnapshots.size).toBe(1)
})

test('returns indeterminate when expected coverage is insufficient', async () => {
  const result = await createWeeklySnapshotRunner(dependencies([
    adapter('hotmart', 'success', 'missing'),
  ])).run(request)
  expect(result.studentSnapshots[0]).toMatchObject({ score: null, actionState: 'indeterminate', experimental: true })
})
```

- [ ] **Step 2: Run the focused test and record RED**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring/weeklySnapshotRunner.test.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the runner with no scheduler registration**

```ts
import type {
  MetricObservation,
  ProviderKey,
  ScoreDefinitionContract,
  ScoreResult,
} from './contracts'
import { calculateDimensionScore, calculateScore } from './scoreCalculator'
import type {
  ProductSnapshotPersistence,
  ScoringRepository,
  StudentSnapshotPersistence,
} from './mongooseScoringRepository'

export interface CollectionContext {
  productId: string
  isoWeek: string
  from: Date
  to: Date
  collectedAt: Date
}

export interface ProviderCollectionResult {
  provider: ProviderKey
  observations: MetricObservation[]
  durationMs: number
}

export interface ProviderMetricsAdapter {
  provider: ProviderKey
  collect(context: CollectionContext): Promise<ProviderCollectionResult>
}

export interface Clock { now(): Date }

export interface WeeklySnapshotDependencies {
  repository: ScoringRepository
  adapters: readonly ProviderMetricsAdapter[]
  clock: Clock
}

export interface WeeklySnapshotRequest {
  productId: string
  profileKey: string
  isoWeek: string
  scoreVersion: string
  from: Date
  to: Date
}

export interface ProviderRunDiagnostic {
  provider: ProviderKey
  status: 'complete' | 'failed'
  observationCount: number
  durationMs: number | null
  failureCategory?: 'provider_unavailable'
}

export interface WeeklySnapshotRunResult {
  status: 'complete' | 'partial'
  providers: ProviderRunDiagnostic[]
  studentSnapshots: StudentSnapshotPersistence[]
  productSnapshot: ProductSnapshotPersistence
  scoreVersion: string
}

const calculateStudentSnapshots = (
  observations: readonly MetricObservation[],
  definition: ScoreDefinitionContract,
  request: WeeklySnapshotRequest,
  freshness: ScoreResult['freshness'],
): StudentSnapshotPersistence[] => {
  const byLearner = new Map<string, MetricObservation[]>()
  observations.filter(item => item.learnerId !== null).forEach(item => {
    byLearner.set(item.learnerId!, [...(byLearner.get(item.learnerId!) ?? []), item])
  })
  return [...byLearner.entries()].map(([learnerId, learnerObservations]) => {
    const dimensions = Object.fromEntries(definition.dimensions.map(item => [
      item.dimension,
      calculateDimensionScore({ expectedSignals: item.signals, observations: learnerObservations }),
    ]))
    const expectedWeight = definition.dimensions.reduce((sum, item) => sum
      + item.signals.reduce((signalSum, signal) => signalSum + signal.weight, 0), 0)
    const observedWeight = definition.dimensions.reduce((sum, item) => sum
      + item.signals.filter(signal => learnerObservations.some(observation => observation.metricKey === signal.metricKey
        && observation.quality === 'observed')).reduce((signalSum, signal) => signalSum + signal.weight, 0), 0)
    const result = calculateScore({
      definition,
      dimensions,
      observedCoverage: expectedWeight === 0 ? 0 : Math.round(observedWeight * 100 / expectedWeight),
      freshness,
    })
    return {
      learnerId,
      productId: request.productId,
      isoWeek: request.isoWeek,
      scoreVersion: request.scoreVersion,
      profileKey: request.profileKey,
      ...result,
    }
  })
}

const calculateExperimentalProductSnapshot = (
  studentSnapshots: readonly StudentSnapshotPersistence[],
  request: WeeklySnapshotRequest,
): ProductSnapshotPersistence => {
  const scores = studentSnapshots.flatMap(item => typeof item.score === 'number' ? [item.score] : [])
  const coverages = studentSnapshots.flatMap(item => typeof item.coverage === 'number' ? [item.coverage] : [])
  return {
    productId: request.productId,
    isoWeek: request.isoWeek,
    scoreVersion: request.scoreVersion,
    profileKey: request.profileKey,
    score: scores.length === 0 ? null : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    learnerCount: studentSnapshots.length,
    eligibleLearnerCount: 0,
    coverage: coverages.length === 0 ? 0 : Math.round(coverages.reduce((sum, value) => sum + value, 0) / coverages.length),
    distribution: {},
    experimental: true,
  }
}

export function createWeeklySnapshotRunner(dependencies: WeeklySnapshotDependencies) {
  return {
    async run(request: WeeklySnapshotRequest): Promise<WeeklySnapshotRunResult> {
      const definition = await dependencies.repository.readExperimentalDefinition(request.profileKey, request.scoreVersion)
      const collectedAt = dependencies.clock.now()
      const providerResults = await Promise.allSettled(
        dependencies.adapters.map(adapter => adapter.collect({
          productId: request.productId,
          isoWeek: request.isoWeek,
          from: request.from,
          to: request.to,
          collectedAt,
        })),
      )
      const observations = providerResults.flatMap(result => result.status === 'fulfilled' ? result.value.observations : [])
      await dependencies.repository.upsertObservations(observations)
      const partial = providerResults.some(result => result.status === 'rejected')
      const studentSnapshots = calculateStudentSnapshots(observations, definition, request, partial ? 'partial' : 'fresh')
      await dependencies.repository.upsertStudentSnapshots(studentSnapshots)
      const productSnapshot = calculateExperimentalProductSnapshot(studentSnapshots, request)
      await dependencies.repository.upsertProductSnapshot(productSnapshot)
      const providers = providerResults.map((result, index): ProviderRunDiagnostic => result.status === 'fulfilled'
        ? {
          provider: dependencies.adapters[index].provider,
          status: 'complete',
          observationCount: result.value.observations.length,
          durationMs: result.value.durationMs,
        }
        : {
          provider: dependencies.adapters[index].provider,
          status: 'failed',
          observationCount: 0,
          durationMs: null,
          failureCategory: 'provider_unavailable',
        })
      return {
        status: partial ? 'partial' : 'complete',
        providers,
        studentSnapshots,
        productSnapshot,
        scoreVersion: request.scoreVersion,
      }
    },
  }
}
```

Require `profileKey` in `WeeklySnapshotRequest`. Results contain only safe aggregate diagnostics: provider, status, counts, duration, score version, and public failure category. Do not return credentials, request headers, raw payloads, native values, or stack traces.

Export only the contracts, calculators, repository factory, and runner factory from `index.ts`. Do not export Mongoose models through this module interface.

- [ ] **Step 4: Run focused GREEN and full foundation tests**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring tests/models/productScoringModels.test.ts`

Expected: all foundation suites PASS.

Run: `npm.cmd run types:check`

Expected: exit 0.

Run: `npm.cmd run lint`

Expected: exit 0.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/services/analytics/productScoring tests/services/analytics/productScoring
git diff --cached --check
git commit -m "feat(analytics): run weekly score snapshots"
git push origin remake
```

---

### Task 6: Foundation acceptance gate

**Files:**
- Modify only files from Tasks 1-5 if a gate exposes a defect.
- Update: `docs/superpowers/plans/2026-09-10-canonical-product-scoring-foundation.md` by checking completed steps and recording exact command totals.

**Interfaces:**
- Consumes: all Task 1-5 deliverables.
- Produces: independently reviewable offline evidence for the foundation; no provider or operational claim.

- [x] **Step 1: Run targeted tests**

Run: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring tests/models/productScoringModels.test.ts`

Expected: all targeted suites PASS with exact suite/test totals recorded in this plan.

- [x] **Step 2: Run repository gates**

Run: `npm.cmd run types:check`

Expected: exit 0.

Run: `npm.cmd run lint`

Expected: exit 0 with zero warnings.

Run: `npm.cmd test -- --runInBand`

Expected: unit and integration projects PASS. If an unrelated existing failure appears, record the exact failure and stop instead of weakening tests.

Run: `npm.cmd run build`

Expected: exit 0.

- [x] **Step 3: Run repository and contract checks**

Run: `npm.cmd run routes:catalog:check`

Expected: exit 0.

Run: `$env:RESPONSE_CONTRACT_FRONT_ROOT='C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front'; npm.cmd run contracts:responses:check`

Expected: exit 0.

Run: `npm.cmd run scalability:reads:check`

Expected: exit 0.

Run: `git diff --check`

Expected: no output.

- [x] **Step 4: Review stop conditions**

Confirm from tests and diff:

- no provider calls or scheduler registration were added;
- no Front or legacy endpoint was changed;
- missing and observed zero remain distinct;
- all score definitions remain disabled and experimental;
- Discord does not appear as an accepted provider;
- reruns remain idempotent by week and version;
- failure output contains no secrets or native payloads.

Any failure stops the ticket and is reported to the user with evidence. Do not infer a solution where the spec requires a user decision.

#### Acceptance evidence — 2026-09-10

- Targeted foundation: `npm.cmd run test:unit -- --runInBand tests/services/analytics/productScoring tests/models/productScoringModels.test.ts` — **5 suites passed, 33 tests passed**, exit 0.
- Type gate: `npm.cmd run types:check` — exit 0.
- Lint gate: `npm.cmd run lint` — exit 0, no ESLint warnings.
- Full test gate: `npm.cmd test -- --runInBand` — **585 suites passed, 3926 tests passed**, 2 Jest projects (`unit`, `integration`), exit 0, 630.042s.
- Build gate: `npm.cmd run build` — exit 0.
- Route catalog: `npm.cmd run routes:catalog:check` — `Route catalog is current (438 runtime identities).`
- Response contracts: `$env:RESPONSE_CONTRACT_FRONT_ROOT='C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front'; npm.cmd run contracts:responses:check` — `Response catalog is current (438 decisions; 227 Front calls; 204 consumers).`
- Scalability: `npm.cmd run scalability:reads:check` — `SCALE-01 inventory OK: 40 complete / 0 pending; SCALE-02 11 complete / 0 pending; SCALE-03 24 complete / 0 pending; main parity 59 adjudicated (55 complete / 0 pending / 4 excluded); 442 Mongoose list sites (AST v2)`.
- Diff hygiene: `git diff --check` — no output.

Stop-condition review:

- No provider call, cron registration, HTTP route, Front change, or legacy endpoint change was added. Task 6 changed only this plan document.
- `ProviderKey` and the Mongoose provider enum contain only `hotmart`, `curseduca`, and `guru`; Discord is absent.
- Targeted tests preserve observed zero as distinct from missing/null evidence; missing evidence does not become zero.
- Score definitions and snapshots remain experimental; definitions remain disabled and rank/action output remains non-definitive.
- Observation and weekly snapshot idempotency remains keyed by observation identity or learner/product/week/version; rerun test passes.
- Runner diagnostics expose provider/status/count/duration and a fixed failure category; raw errors, native values, credentials, and payloads are not returned.

The full test run emitted existing Mongoose warnings for duplicate indexes and reserved `errors` paths. They are outside Tasks 1–5 and were not changed.

- [x] **Step 5: Commit evidence and push the completed ticket**

```bash
git add docs/superpowers/plans/2026-09-10-canonical-product-scoring-foundation.md
git diff --cached --check
git commit -m "docs(analytics): record scoring foundation evidence"
git push origin remake
```

After push, verify `git status --short --branch`, `git rev-parse HEAD`, and `git ls-remote --heads origin remake` agree. Report local implementation, offline evidence, and unperformed provider/live/deployment validation as separate states.
