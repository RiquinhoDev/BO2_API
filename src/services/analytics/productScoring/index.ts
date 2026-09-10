export { buildMetricObservation } from './contracts'
export type {
  DimensionDefinition,
  DimensionKey,
  DimensionScore,
  MetricObservation,
  ObservationQuality,
  ProviderKey,
  ScoreDefinitionContract,
  ScoreResult,
  SignalDefinition,
} from './contracts'

export { calculateDimensionScore, calculateScore } from './scoreCalculator'
export type { DimensionCalculationInput, ScoreCalculationInput } from './scoreCalculator'

export { createMongooseScoringRepository, ScoringCapacityError } from './mongooseScoringRepository'
export type {
  ObservationWindow,
  PersistenceSummary,
  ProductSnapshotPersistence,
  ScoringModels,
  ScoringRepository,
  StudentSnapshotPersistence,
} from './mongooseScoringRepository'

export { createWeeklySnapshotRunner } from './weeklySnapshotRunner'
export type {
  Clock,
  CollectionContext,
  ProviderCollectionResult,
  ProviderMetricsAdapter,
  ProviderRunDiagnostic,
  WeeklySnapshotDependencies,
  WeeklySnapshotRequest,
  WeeklySnapshotRunResult,
} from './weeklySnapshotRunner'
