import {
  calculateCombinedEngagement,
  type EngagementResult,
  type UserData,
} from '../../utils/engagementCalculator'

export const SCORE_RECALCULATION_BATCH_SIZE = 100

export interface ScoreRecalculationLearner {
  id: string
  name?: string
  email?: string
  currentScore?: number
  currentLevel?: string
  accessCount?: number
  totalProgress?: number
}

export interface ScoreRecalculationUpdate {
  learnerId: string
  calculatedAt: Date
  score: number
  level: EngagementResult['level']
}

export interface ScoreRecalculationBatchWrite {
  successfulIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
}

export interface ScoreRecalculationRepository {
  streamByClass(classId: string): AsyncIterable<ScoreRecalculationLearner>
  persistBatch(
    updates: readonly ScoreRecalculationUpdate[],
  ): Promise<ScoreRecalculationBatchWrite>
}

export interface ScoreRecalculationObserver {
  calculationFailed(event: { learnerId: string; cause: unknown }): void
  writeFailed(event: { learnerIds: readonly string[]; cause: unknown }): void
}

export interface ScoreRecalculationSuccessResult {
  studentId: string
  name: string
  oldScore: number
  newScore: number
  oldLevel: string
  newLevel: EngagementResult['level']
}

export interface ScoreRecalculationFailureResult {
  studentId: string
  name: string
  error: 'Não foi possível atualizar o score'
}

export type ScoreRecalculationResult =
  | ScoreRecalculationSuccessResult
  | ScoreRecalculationFailureResult

export type ScoreRecalculationOutcome =
  | { kind: 'not-found' }
  | {
      kind: 'completed'
      classId: string
      totalStudents: number
      successfulUpdates: number
      failedUpdates: number
      calculationDuration: number
      completedAt: Date
      results: ScoreRecalculationResult[]
    }

const NOOP_OBSERVER: ScoreRecalculationObserver = {
  calculationFailed: () => undefined,
  writeFailed: () => undefined,
}

const FAILURE_MESSAGE = 'Não foi possível atualizar o score'

interface CalculatedLearner {
  learner: ScoreRecalculationLearner
  update?: ScoreRecalculationUpdate
}

interface ProcessedBatch {
  results: ScoreRecalculationResult[]
  successfulUpdates: number
  failedUpdates: number
}

export class IndividualScoreRecalculationService {
  constructor(
    private readonly repository: ScoreRecalculationRepository,
    private readonly calculator: (input: UserData) => EngagementResult = calculateCombinedEngagement,
    private readonly now: () => Date = () => new Date(),
    private readonly observer: ScoreRecalculationObserver = NOOP_OBSERVER,
  ) {}

  async recalculate(classId: string): Promise<ScoreRecalculationOutcome> {
    const startedAt = this.now()
    const results: ScoreRecalculationResult[] = []
    let totalStudents = 0
    let successfulUpdates = 0
    let failedUpdates = 0
    let batch: ScoreRecalculationLearner[] = []

    for await (const learner of this.repository.streamByClass(classId)) {
      totalStudents += 1
      batch.push(learner)

      if (batch.length === SCORE_RECALCULATION_BATCH_SIZE) {
        const processed = await this.processBatch(batch, startedAt)
        results.push(...processed.results)
        successfulUpdates += processed.successfulUpdates
        failedUpdates += processed.failedUpdates
        batch = []
      }
    }

    if (totalStudents === 0) return { kind: 'not-found' }

    if (batch.length > 0) {
      const processed = await this.processBatch(batch, startedAt)
      results.push(...processed.results)
      successfulUpdates += processed.successfulUpdates
      failedUpdates += processed.failedUpdates
    }

    const completedAt = this.now()

    return {
      kind: 'completed',
      classId,
      totalStudents,
      successfulUpdates,
      failedUpdates,
      calculationDuration: completedAt.getTime() - startedAt.getTime(),
      completedAt,
      results,
    }
  }

  private async processBatch(
    batch: readonly ScoreRecalculationLearner[],
    calculatedAt: Date,
  ): Promise<ProcessedBatch> {
    const entries: CalculatedLearner[] = []
    const updates: ScoreRecalculationUpdate[] = []

    for (const learner of batch) {
      try {
        const calculated = this.calculator({
          engagement: learner.currentLevel,
          accessCount: learner.accessCount,
          progress: { completedPercentage: learner.totalProgress },
        })
        const update: ScoreRecalculationUpdate = {
          learnerId: learner.id,
          calculatedAt,
          score: calculated.score,
          level: calculated.level,
        }
        entries.push({ learner, update })
        updates.push(update)
      } catch (cause) {
        this.observer.calculationFailed({ learnerId: learner.id, cause })
        entries.push({ learner })
      }
    }

    let write: ScoreRecalculationBatchWrite | undefined
    if (updates.length > 0) {
      try {
        write = await this.repository.persistBatch(updates)
      } catch (cause) {
        this.observer.writeFailed({
          learnerIds: updates.map((update) => update.learnerId),
          cause,
        })
      }
    }

    const results: ScoreRecalculationResult[] = entries.map((entry) => {
      const publicName = this.publicName(entry.learner)
      const update = entry.update
      const succeeded = update !== undefined
        && write !== undefined
        && write.successfulIds.has(update.learnerId)
        && !write.failedIds.has(update.learnerId)

      if (!succeeded || update === undefined) {
        return {
          studentId: entry.learner.id,
          name: publicName,
          error: FAILURE_MESSAGE,
        }
      }

      return {
        studentId: entry.learner.id,
        name: publicName,
        oldScore: entry.learner.currentScore ?? 0,
        newScore: update.score,
        oldLevel: entry.learner.currentLevel || 'BAIXO',
        newLevel: update.level,
      }
    })
    const successfulUpdates = results.filter((result) => 'newScore' in result).length

    return {
      results,
      successfulUpdates,
      failedUpdates: results.length - successfulUpdates,
    }
  }

  private publicName(learner: ScoreRecalculationLearner): string {
    return learner.name || learner.email || 'Aluno sem identificação'
  }
}
