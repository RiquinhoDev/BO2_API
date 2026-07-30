import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import {
  IndividualScoreRecalculationService,
  type ScoreRecalculationObserver,
} from '../../../src/services/analytics/individualScoreRecalculation.service'
import { MongooseIndividualScoreRecalculationRepository } from '../../../src/services/analytics/mongooseIndividualScoreRecalculation.repository'

let mongoServer: MongoMemoryServer

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

function userFixture(index: number, classId = 'class-1') {
  return {
    email: `learner-${index}@example.test`,
    name: `Learner ${index}`,
    classId,
    discord: { isDeleted: false },
    combined: {
      combinedEngagement: 0,
      engagement: { level: 'BAIXO' },
      totalProgress: 0,
    },
    hotmart: { engagement: { accessCount: 0 } },
  }
}

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'individual_score_recalculation_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('individual_score_recalculation_test'),
    ),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await User.collection.deleteMany({})
  jest.restoreAllMocks()
})

describe('MongooseIndividualScoreRecalculationRepository', () => {
  it('streams only canonical class learners in ID order through the narrow projection', async () => {
    const first = new mongoose.Types.ObjectId('000000000000000000000001')
    const second = new mongoose.Types.ObjectId('000000000000000000000002')
    const legacyDeleted = new mongoose.Types.ObjectId('000000000000000000000003')
    await User.collection.insertMany([
      { ...userFixture(1), _id: second, name: '', email: 'fallback@example.test' },
      { ...userFixture(2), _id: first },
      { ...userFixture(3), classId: 'class-2' },
      { ...userFixture(4), discord: { isDeleted: true } },
    ])
    await User.collection.insertOne({
      ...userFixture(5),
      _id: legacyDeleted,
      isDeleted: true,
    })
    const find = jest.spyOn(User, 'find')
    const select = jest.spyOn(mongoose.Query.prototype, 'select')
    const sort = jest.spyOn(mongoose.Query.prototype, 'sort')
    const cursor = jest.spyOn(mongoose.Query.prototype, 'cursor')
    const repository = new MongooseIndividualScoreRecalculationRepository()

    const learners = []
    for await (const learner of repository.streamByClass('class-1')) learners.push(learner)

    expect(learners).toEqual([
      {
        id: String(first),
        name: 'Learner 2',
        email: 'learner-2@example.test',
        currentScore: 0,
        currentLevel: 'BAIXO',
        accessCount: 0,
        totalProgress: 0,
      },
      {
        id: String(second),
        name: '',
        email: 'fallback@example.test',
        currentScore: 0,
        currentLevel: 'BAIXO',
        accessCount: 0,
        totalProgress: 0,
      },
    ])
    expect(find).toHaveBeenCalledWith({
      classId: 'class-1',
      'discord.isDeleted': { $ne: true },
      isDeleted: { $ne: true },
    })
    expect(find).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith({
      _id: 1,
      name: 1,
      email: 1,
      'combined.combinedEngagement': 1,
      'combined.engagement.level': 1,
      'combined.totalProgress': 1,
      'hotmart.engagement.accessCount': 1,
    })
    expect(sort).toHaveBeenCalledWith({ _id: 1 })
    expect(cursor).toHaveBeenCalledWith({ batchSize: 100 })
  })

  it('writes a batch with the canonical five-field update', async () => {
    const first = await User.collection.insertOne(userFixture(1))
    const second = await User.collection.insertOne(userFixture(2))
    const bulkWrite = jest.spyOn(User, 'bulkWrite')
    const calculatedAt = new Date('2026-07-30T10:00:00.000Z')
    const repository = new MongooseIndividualScoreRecalculationRepository()

    const outcome = await repository.persistBatch([
      { learnerId: String(first.insertedId), score: 42, level: 'MEDIO', calculatedAt },
      { learnerId: String(second.insertedId), score: 15, level: 'BAIXO', calculatedAt },
    ])

    expect(outcome).toEqual({
      successfulIds: new Set([String(first.insertedId), String(second.insertedId)]),
      failedIds: new Set<string>(),
    })
    expect(bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: first.insertedId },
          update: {
            $set: {
              'combined.combinedEngagement': 42,
              'combined.engagement.score': 42,
              'combined.engagement.level': 'MEDIO',
              'combined.calculatedAt': calculatedAt,
              'metadata.updatedAt': calculatedAt,
            },
          },
        },
      },
      {
        updateOne: {
          filter: { _id: second.insertedId },
          update: {
            $set: {
              'combined.combinedEngagement': 15,
              'combined.engagement.score': 15,
              'combined.engagement.level': 'BAIXO',
              'combined.calculatedAt': calculatedAt,
              'metadata.updatedAt': calculatedAt,
            },
          },
        },
      },
    ], { ordered: false })
  })

  it('returns only indexed bulk failures and preserves their private cause for the observer', async () => {
    const observer = new RecordingObserver()
    const repository = new MongooseIndividualScoreRecalculationRepository(observer)
    const cause = { writeErrors: [{ index: 1, errmsg: 'private database detail' }] }
    jest.spyOn(User, 'bulkWrite').mockRejectedValueOnce(cause)

    const outcome = await repository.persistBatch([
      { learnerId: 'first', score: 42, level: 'MEDIO', calculatedAt: new Date() },
      { learnerId: 'second', score: 15, level: 'BAIXO', calculatedAt: new Date() },
    ])

    expect(outcome).toEqual({
      successfulIds: new Set(['first']),
      failedIds: new Set(['second']),
    })
    expect(observer.writeFailures).toEqual([{ learnerIds: ['second'], cause }])
    expect(JSON.stringify(outcome)).not.toContain('private database detail')
  })

  it('fails every submitted learner when a bulk error cannot identify valid write indexes', async () => {
    const observer = new RecordingObserver()
    const repository = new MongooseIndividualScoreRecalculationRepository(observer)
    const cause = { cause: 'unclassified' }
    jest.spyOn(User, 'bulkWrite').mockRejectedValueOnce(cause)

    await expect(repository.persistBatch([
      { learnerId: 'first', score: 42, level: 'MEDIO', calculatedAt: new Date() },
      { learnerId: 'second', score: 15, level: 'BAIXO', calculatedAt: new Date() },
    ])).resolves.toEqual({
      successfulIds: new Set<string>(),
      failedIds: new Set(['first', 'second']),
    })
    expect(observer.writeFailures).toEqual([{ learnerIds: ['first', 'second'], cause }])
  })

  it('drives 205 real learners through three bounded bulk writes', async () => {
    await User.collection.insertMany(
      Array.from({ length: 205 }, (_, index) => userFixture(index)),
    )
    const bulkWrite = jest.spyOn(User, 'bulkWrite')
    const findByIdAndUpdate = jest.spyOn(User, 'findByIdAndUpdate')
    const updateOne = jest.spyOn(User, 'updateOne')
    const service = new IndividualScoreRecalculationService(
      new MongooseIndividualScoreRecalculationRepository(),
      () => ({
        score: 42,
        level: 'MEDIO',
        levelLabel: 'Médio',
        color: 'blue',
        icon: 'chart',
        breakdown: {
          accessScore: 0,
          progressScore: 0,
          engagementScore: 0,
          weights: { access: 0.4, progress: 0.4, engagement: 0.2 },
        },
      }),
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    const outcome = await service.recalculate('class-1')

    expect(bulkWrite).toHaveBeenCalledTimes(3)
    expect(bulkWrite.mock.calls.map(([operations]) => operations.length)).toEqual([100, 100, 5])
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
    expect(updateOne).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      kind: 'completed',
      totalStudents: 205,
      successfulUpdates: 205,
      failedUpdates: 0,
    })
    await expect(User.countDocuments({
      'combined.combinedEngagement': 42,
      'combined.engagement.score': 42,
      'combined.engagement.level': 'MEDIO',
      'combined.calculatedAt': new Date('2026-07-30T10:00:00.000Z'),
      'metadata.updatedAt': new Date('2026-07-30T10:00:00.000Z'),
    })).resolves.toBe(205)
  })
})
