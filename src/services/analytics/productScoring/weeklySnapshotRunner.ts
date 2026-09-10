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
  partial: boolean,
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
        && observation.dimension === signal.dimension
        && observation.quality === 'observed')).reduce((signalSum, signal) => signalSum + signal.weight, 0), 0)
    const stale = learnerObservations.some(item => item.quality === 'stale')
    const freshness: ScoreResult['freshness'] = partial ? 'partial' : stale ? 'stale' : 'fresh'
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
      const persistedObservations = await dependencies.repository.readObservations({
        productId: request.productId,
        from: request.from,
        to: request.to,
      })
      const partial = providerResults.some(result => result.status === 'rejected')
      const studentSnapshots = calculateStudentSnapshots(persistedObservations, definition, request, partial)
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
