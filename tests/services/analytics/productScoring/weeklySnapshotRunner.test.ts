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

const observation = (
  quality: 'observed' | 'missing' | 'stale' = 'observed',
  learnerId = '507f1f77bcf86cd799439011',
): MetricObservation => ({
  observationKey: `hotmart:${learnerId}:ogi:access-count:2026-W37:${quality}`,
  learnerId,
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

const adapter = (
  provider: ProviderKey,
  mode: 'success' | 'failure',
  quality: 'observed' | 'missing' = 'observed',
): ProviderMetricsAdapter => ({
  provider,
  async collect() {
    if (mode === 'failure') throw new Error('provider unavailable')
    return { provider, observations: [{ ...observation(quality), provider }], durationMs: 10 }
  },
})

const dependencies = (
  adapters: ProviderMetricsAdapter[],
  minimumCoverage = 70,
  persistedObservations: MetricObservation[] = [],
): WeeklySnapshotDependencies & { storedStudentSnapshots: Map<string, StudentSnapshotPersistence> } => {
  const storedStudentSnapshots = new Map<string, StudentSnapshotPersistence>()
  const storedObservations = new Map(persistedObservations.map(row => [row.observationKey, row]))
  const repository: ScoringRepository = {
    upsertObservations: jest.fn(async rows => {
      rows.forEach(row => storedObservations.set(row.observationKey, row))
      return { inserted: rows.length, updated: 0 }
    }),
    readObservations: jest.fn(async () => [...storedObservations.values()]),
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

test('scores the canonical observations read after an empty provider collection', async () => {
  const emptyAdapter: ProviderMetricsAdapter = {
    provider: 'hotmart',
    async collect() {
      return { provider: 'hotmart', observations: [], durationMs: 10 }
    },
  }
  const deps = dependencies([emptyAdapter], 70, [observation()])

  const result = await createWeeklySnapshotRunner(deps).run(request)

  expect(deps.repository.readObservations).toHaveBeenCalledWith({
    productId: request.productId,
    from: request.from,
    to: request.to,
  })
  expect(result.studentSnapshots[0]).toMatchObject({ learnerId: observation().learnerId, score: 80 })
})

test('marks the score stale when persisted canonical evidence is stale', async () => {
  const emptyAdapter: ProviderMetricsAdapter = {
    provider: 'hotmart',
    async collect() {
      return { provider: 'hotmart', observations: [], durationMs: 10 }
    },
  }
  const result = await createWeeklySnapshotRunner(dependencies([emptyAdapter], 70, [observation('stale')])).run(request)

  expect(result.studentSnapshots[0]).toMatchObject({ freshness: 'stale', score: null })
})

test('scopes freshness to each learner observation set', async () => {
  const emptyAdapter: ProviderMetricsAdapter = {
    provider: 'hotmart',
    async collect() {
      return { provider: 'hotmart', observations: [], durationMs: 10 }
    },
  }
  const freshLearnerId = '507f1f77bcf86cd799439011'
  const staleLearnerId = '507f1f77bcf86cd799439012'
  const result = await createWeeklySnapshotRunner(dependencies([emptyAdapter], 70, [
    observation('observed', freshLearnerId),
    observation('stale', staleLearnerId),
  ])).run(request)

  expect(result.studentSnapshots).toEqual(expect.arrayContaining([
    expect.objectContaining({ learnerId: freshLearnerId, freshness: 'fresh', score: 80 }),
    expect.objectContaining({ learnerId: staleLearnerId, freshness: 'stale', score: null }),
  ]))
})

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
  expect(result.providers[1]).not.toHaveProperty('error')
  expect(result.studentSnapshots[0]).toMatchObject({ freshness: 'partial' })
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

test('does not count another dimension towards coverage', async () => {
  const wrongDimensionAdapter: ProviderMetricsAdapter = {
    provider: 'hotmart',
    async collect() {
      return {
        provider: 'hotmart',
        observations: [{ ...observation(), dimension: 'journey' }],
        durationMs: 10,
      }
    },
  }

  const result = await createWeeklySnapshotRunner(dependencies([wrongDimensionAdapter])).run(request)

  expect(result.studentSnapshots[0]).toMatchObject({ score: null, coverage: 0, actionState: 'indeterminate' })
})
