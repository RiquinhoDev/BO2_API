import {
  IndividualScoreRecalculationService,
  type ScoreRecalculationLearner,
  type ScoreRecalculationObserver,
  type ScoreRecalculationBatchWrite,
  type ScoreRecalculationRepository,
  type ScoreRecalculationUpdate,
} from '../../../src/services/analytics/individualScoreRecalculation.service'
import type { EngagementResult, UserData } from '../../../src/utils/engagementCalculator'

const learner = (
  id: string,
  overrides: Partial<ScoreRecalculationLearner> = {},
): ScoreRecalculationLearner => ({
  id,
  name: `Learner ${id}`,
  currentScore: 0,
  currentLevel: 'BAIXO',
  accessCount: 0,
  totalProgress: 0,
  ...overrides,
})

async function* stream(
  learners: readonly ScoreRecalculationLearner[],
): AsyncIterable<ScoreRecalculationLearner> {
  for (const item of learners) yield item
}

class FakeRepository implements ScoreRecalculationRepository {
  readonly persistedBatches: ScoreRecalculationUpdate[][] = []

  constructor(
    private readonly learners: readonly ScoreRecalculationLearner[],
    private readonly onPersist: (
      updates: readonly ScoreRecalculationUpdate[],
      call: number,
    ) => Promise<ScoreRecalculationBatchWrite> = async (updates) => ({
      successfulIds: new Set(updates.map((update) => update.learnerId)),
      failedIds: new Set<string>(),
    }),
  ) {}

  streamByClass(): AsyncIterable<ScoreRecalculationLearner> {
    return stream(this.learners)
  }

  async persistBatch(updates: readonly ScoreRecalculationUpdate[]) {
    this.persistedBatches.push([...updates])
    return this.onPersist(updates, this.persistedBatches.length)
  }
}

class RecordingObserver implements ScoreRecalculationObserver {
  readonly calculationFailures: Array<{ learnerId: string; cause: unknown }> = []
  readonly writeFailures: Array<{ learnerIds: readonly string[]; cause: unknown }> = []

  calculationFailed(event: { learnerId: string; cause: unknown }): void {
    this.calculationFailures.push(event)
  }

  writeFailed(event: { learnerIds: readonly string[]; cause: unknown }): void {
    this.writeFailures.push(event)
  }
}

const engagement = (
  score: number,
  level: EngagementResult['level'],
): EngagementResult => ({
  score,
  level,
  levelLabel: 'irrelevant',
  color: 'irrelevant',
  icon: 'irrelevant',
  breakdown: {
    accessScore: 0,
    progressScore: 0,
    engagementScore: 0,
    weights: { access: 0.4, progress: 0.4, engagement: 0.2 },
  },
})

describe('IndividualScoreRecalculationService', () => {
  it('returns not-found for an empty stream without a write or finish clock', async () => {
    const repository = new FakeRepository([])
    const now = jest.fn(() => new Date('2026-07-30T10:00:00.000Z'))
    const service = new IndividualScoreRecalculationService(
      repository,
      undefined,
      now,
    )

    await expect(service.recalculate('class-empty')).resolves.toEqual({
      kind: 'not-found',
    })
    expect(repository.persistedBatches).toEqual([])
    expect(now).toHaveBeenCalledTimes(1)
  })

  it('preserves zero values and produces one timestamped recalculation result', async () => {
    const repository = new FakeRepository([
      learner('learner-1', {
        name: '',
        email: 'fallback@example.test',
        currentScore: 0,
        currentLevel: '',
        accessCount: 0,
        totalProgress: 0,
      }),
    ])
    const startedAt = new Date('2026-07-30T10:00:00.000Z')
    const completedAt = new Date('2026-07-30T10:00:00.250Z')
    const now = jest
      .fn< Date, []>()
      .mockReturnValueOnce(startedAt)
      .mockReturnValueOnce(completedAt)
    const service = new IndividualScoreRecalculationService(
      repository,
      undefined,
      now,
    )

    await expect(service.recalculate('class-one')).resolves.toEqual({
      kind: 'completed',
      classId: 'class-one',
      totalStudents: 1,
      successfulUpdates: 1,
      failedUpdates: 0,
      calculationDuration: 250,
      completedAt,
      results: [{
        studentId: 'learner-1',
        name: 'fallback@example.test',
        oldScore: 0,
        newScore: 4,
        oldLevel: 'BAIXO',
        newLevel: 'MUITO_BAIXO',
      }],
    })
    expect(repository.persistedBatches).toEqual([[
      {
        learnerId: 'learner-1',
        calculatedAt: startedAt,
        score: 4,
        level: 'MUITO_BAIXO',
      },
    ]])
    expect(now).toHaveBeenCalledTimes(2)
  })

  it('maps only supported learner fields into the calculator', async () => {
    const repository = new FakeRepository([
      learner('learner-mapped', {
        name: 'Private name',
        email: 'private@example.test',
        currentScore: 51,
        currentLevel: 'ALTO',
        accessCount: 7,
        totalProgress: 42,
      }),
    ])
    const calculator = jest.fn((input: UserData) => engagement(37, 'MEDIO'))
    const service = new IndividualScoreRecalculationService(
      repository,
      calculator,
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    await service.recalculate('class-mapped')

    expect(calculator).toHaveBeenCalledWith({
      engagement: 'ALTO',
      accessCount: 7,
      progress: { completedPercentage: 42 },
    })
  })

  it('writes streamed learners in deterministic batches of 100 and preserves result order', async () => {
    const learners = Array.from({ length: 205 }, (_, index) => learner(`learner-${index}`))
    const repository = new FakeRepository(learners)
    const service = new IndividualScoreRecalculationService(
      repository,
      () => engagement(20, 'BAIXO'),
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    const outcome = await service.recalculate('class-batches')

    expect(repository.persistedBatches.map((batch) => batch.length)).toEqual([100, 100, 5])
    expect(outcome).toMatchObject({
      kind: 'completed',
      totalStudents: 205,
      successfulUpdates: 205,
      failedUpdates: 0,
    })
    if (outcome.kind === 'completed') {
      expect(outcome.results.map((result) => result.studentId)).toEqual(
        learners.map((item) => item.id),
      )
    }
  })

  it('keeps a calculation failure at its input position and observes only its ID and cause', async () => {
    const calculationCause = new Error('calculator exploded')
    const repository = new FakeRepository([
      learner('first'),
      learner('calculation-failed', {
        name: 'Private learner name',
        email: 'private@example.test',
        accessCount: 99,
      }),
      learner('last'),
    ])
    const observer = new RecordingObserver()
    const service = new IndividualScoreRecalculationService(
      repository,
      (input) => {
        if (input.accessCount === 99) throw calculationCause
        return engagement(22, 'BAIXO')
      },
      () => new Date('2026-07-30T10:00:00.000Z'),
      observer,
    )

    await expect(service.recalculate('class-calculation-failure')).resolves.toMatchObject({
      kind: 'completed',
      successfulUpdates: 2,
      failedUpdates: 1,
      results: [
        { studentId: 'first', newScore: 22 },
        {
          studentId: 'calculation-failed',
          name: 'Private learner name',
          error: 'Não foi possível atualizar o score',
        },
        { studentId: 'last', newScore: 22 },
      ],
    })
    expect(repository.persistedBatches[0].map((update) => update.learnerId)).toEqual([
      'first',
      'last',
    ])
    expect(observer.calculationFailures).toEqual([{
      learnerId: 'calculation-failed',
      cause: calculationCause,
    }])
    expect(observer.writeFailures).toEqual([])
  })

  it('maps indexed write failures into stable generic failure rows', async () => {
    const repository = new FakeRepository(
      [learner('write-success'), learner('write-failed')],
      async () => ({
        successfulIds: new Set(['write-success']),
        failedIds: new Set(['write-failed']),
      }),
    )
    const service = new IndividualScoreRecalculationService(
      repository,
      () => engagement(22, 'BAIXO'),
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    await expect(service.recalculate('class-indexed-failure')).resolves.toMatchObject({
      kind: 'completed',
      successfulUpdates: 1,
      failedUpdates: 1,
      results: [
        { studentId: 'write-success', newScore: 22 },
        {
          studentId: 'write-failed',
          error: 'Não foi possível atualizar o score',
        },
      ],
    })
  })

  it('treats an omitted write outcome ID as a generic failure', async () => {
    const repository = new FakeRepository(
      [learner('known-success'), learner('omitted')],
      async () => ({
        successfulIds: new Set(['known-success']),
        failedIds: new Set<string>(),
      }),
    )
    const service = new IndividualScoreRecalculationService(
      repository,
      () => engagement(22, 'BAIXO'),
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    await expect(service.recalculate('class-omitted')).resolves.toMatchObject({
      kind: 'completed',
      successfulUpdates: 1,
      failedUpdates: 1,
      results: [
        { studentId: 'known-success', newScore: 22 },
        {
          studentId: 'omitted',
          error: 'Não foi possível atualizar o score',
        },
      ],
    })
  })

  it('converts one repository failure into batch-local generic rows and continues', async () => {
    const writeCause = new Error('database unavailable')
    const learners = Array.from({ length: 205 }, (_, index) => learner(`learner-${index}`))
    const repository = new FakeRepository(learners, async (updates, call) => {
      if (call === 2) throw writeCause
      return {
        successfulIds: new Set(updates.map((update) => update.learnerId)),
        failedIds: new Set<string>(),
      }
    })
    const observer = new RecordingObserver()
    const service = new IndividualScoreRecalculationService(
      repository,
      () => engagement(22, 'BAIXO'),
      () => new Date('2026-07-30T10:00:00.000Z'),
      observer,
    )

    const outcome = await service.recalculate('class-write-failure')

    expect(repository.persistedBatches.map((batch) => batch.length)).toEqual([100, 100, 5])
    expect(outcome).toMatchObject({
      kind: 'completed',
      successfulUpdates: 105,
      failedUpdates: 100,
    })
    if (outcome.kind === 'completed') {
      expect(outcome.results[99]).toMatchObject({ studentId: 'learner-99', newScore: 22 })
      expect(outcome.results[100]).toEqual({
        studentId: 'learner-100',
        name: 'Learner learner-100',
        error: 'Não foi possível atualizar o score',
      })
      expect(outcome.results[199]).toMatchObject({
        studentId: 'learner-199',
        error: 'Não foi possível atualizar o score',
      })
      expect(outcome.results[200]).toMatchObject({ studentId: 'learner-200', newScore: 22 })
      expect(outcome.results.some((result) => 'error' in result && result.error === writeCause.message)).toBe(false)
    }
    expect(observer.writeFailures).toEqual([{
      learnerIds: learners.slice(100, 200).map((item) => item.id),
      cause: writeCause,
    }])
  })
})
