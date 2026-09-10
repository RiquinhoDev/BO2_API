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
  studentSnapshotBulkWrite?: jest.Mock
  productSnapshotUpdateOne?: jest.Mock
  definition?: Record<string, unknown> | null
} = {}) => ({
  MetricObservation: {
    bulkWrite: overrides.observationBulkWrite ?? jest.fn(),
    find: overrides.observationFind ?? jest.fn(() => ({
      select: jest.fn(() => ({ limit: jest.fn(() => query([])) })),
    })),
  },
  ScoreDefinition: {
    findOne: jest.fn(() => query(overrides.definition ?? {
      profileKey: 'learner-course', version: '1.0-experimental', experimental: true, enabled: false,
    })),
  },
  StudentProductWeeklySnapshot: {
    bulkWrite: overrides.studentSnapshotBulkWrite ?? jest.fn(),
  },
  ProductWeeklySnapshot: {
    updateOne: overrides.productSnapshotUpdateOne ?? jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  },
})

test('bulk upserts observations by observationKey', async () => {
  const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite: bulkWrite }))
  const observation = observationFixture()

  await repository.upsertObservations([observation])

  expect(bulkWrite).toHaveBeenCalledWith([
    expect.objectContaining({
      updateOne: expect.objectContaining({
        filter: { observationKey: observation.observationKey },
        upsert: true,
      }),
    }),
  ], { ordered: false })
})

test('bounds reads by product and source-event window without selecting nativeValue', async () => {
  const exec = jest.fn().mockResolvedValue([])
  const limit = jest.fn(() => ({ lean: jest.fn(() => ({ exec })) }))
  const select = jest.fn(() => ({ limit }))
  const find = jest.fn(() => ({ select }))
  const repository = createMongooseScoringRepository(fakeModels({ observationFind: find }))
  const from = new Date('2026-09-07T00:00:00.000Z')
  const to = new Date('2026-09-14T00:00:00.000Z')

  await repository.readObservations({
    productId: '507f191e810c19729de860ea',
    from,
    to,
  })

  expect(find).toHaveBeenCalledWith({
    productId: '507f191e810c19729de860ea',
    sourceEventAt: { $gte: from, $lt: to },
  })
  expect(select).toHaveBeenCalledWith('-nativeValue')
  expect(limit).toHaveBeenCalledWith(20_000)
  expect(exec).toHaveBeenCalledTimes(1)
})

test('does not call Mongoose for empty observation or student snapshot batches', async () => {
  const observationBulkWrite = jest.fn()
  const studentSnapshotBulkWrite = jest.fn()
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite, studentSnapshotBulkWrite }))

  await expect(repository.upsertObservations([])).resolves.toEqual({ inserted: 0, updated: 0 })
  await expect(repository.upsertStudentSnapshots([])).resolves.toEqual({ inserted: 0, updated: 0 })

  expect(observationBulkWrite).not.toHaveBeenCalled()
  expect(studentSnapshotBulkWrite).not.toHaveBeenCalled()
})

test('rejects batches beyond the twenty-thousand item cap before persistence', async () => {
  const observationBulkWrite = jest.fn()
  const studentSnapshotBulkWrite = jest.fn()
  const repository = createMongooseScoringRepository(fakeModels({ observationBulkWrite, studentSnapshotBulkWrite }))

  await expect(repository.upsertObservations(Array.from({ length: 20_001 }, observationFixture)))
    .rejects.toThrow('SCORING_CAPACITY_EXCEEDED')
  await expect(repository.upsertStudentSnapshots(Array.from({ length: 20_001 }, () => ({
    learnerId: '507f1f77bcf86cd799439011',
    productId: '507f191e810c19729de860ea',
    isoWeek: '2026-W37',
    scoreVersion: '1.0-experimental',
  }))))
    .rejects.toThrow('SCORING_CAPACITY_EXCEEDED')

  expect(observationBulkWrite).not.toHaveBeenCalled()
  expect(studentSnapshotBulkWrite).not.toHaveBeenCalled()
})

test('upserts student snapshots by learner, product, week, and score version', async () => {
  const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
  const repository = createMongooseScoringRepository(fakeModels({ studentSnapshotBulkWrite: bulkWrite }))
  const snapshot = {
    learnerId: '507f1f77bcf86cd799439011',
    productId: '507f191e810c19729de860ea',
    isoWeek: '2026-W37',
    scoreVersion: '1.0-experimental',
    profileKey: 'learner-course',
    score: null,
    dimensions: {},
    coverage: 0,
    freshness: 'fresh',
    experimental: true,
    eligibleForRank: false,
    actionState: 'indeterminate',
    reasons: [],
    missingSignals: [],
  }

  await repository.upsertStudentSnapshots([snapshot])

  expect(bulkWrite).toHaveBeenCalledWith([
    {
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
    },
  ], { ordered: false })
})

test('upserts product snapshots by product, week, and score version', async () => {
  const exec = jest.fn().mockResolvedValue({})
  const updateOne = jest.fn(() => ({ exec }))
  const repository = createMongooseScoringRepository(fakeModels({ productSnapshotUpdateOne: updateOne }))
  const snapshot = {
    productId: '507f191e810c19729de860ea',
    isoWeek: '2026-W37',
    scoreVersion: '1.0-experimental',
    profileKey: 'product-health',
    score: null,
    learnerCount: 0,
    eligibleLearnerCount: 0,
    coverage: 0,
    distribution: {},
    experimental: true,
  }

  await repository.upsertProductSnapshot(snapshot)

  expect(updateOne).toHaveBeenCalledWith(
    {
      productId: snapshot.productId,
      isoWeek: snapshot.isoWeek,
      scoreVersion: snapshot.scoreVersion,
    },
    { $set: snapshot },
    { upsert: true },
  )
  expect(exec).toHaveBeenCalledTimes(1)
})

test('refuses to load a non-experimental or enabled definition', async () => {
  const repository = createMongooseScoringRepository(fakeModels({ definition: { experimental: false, enabled: true } }))

  await expect(repository.readExperimentalDefinition('ogi-course', '1.0-experimental'))
    .rejects.toThrow('foundation accepts disabled experimental definitions only')
})
