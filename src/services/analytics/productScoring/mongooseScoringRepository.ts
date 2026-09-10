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
      const observations = await models.MetricObservation.find({ productId, sourceEventAt: { $gte: from, $lt: to } })
        .select('-nativeValue')
        .limit(20_001)
        .lean()
        .exec()
      assertScoringCapacity(observations.length)
      return observations
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
