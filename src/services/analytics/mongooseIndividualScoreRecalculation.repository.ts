import { Types } from 'mongoose'
import User from '../../models/user'
import {
  SCORE_RECALCULATION_BATCH_SIZE,
  type ScoreRecalculationBatchWrite,
  type ScoreRecalculationObserver,
  type ScoreRecalculationRepository,
  type ScoreRecalculationUpdate,
} from './individualScoreRecalculation.service'

interface ScoreRecalculationProjection {
  _id: Types.ObjectId
  name?: string
  email?: string
  combined?: {
    combinedEngagement?: number
    engagement?: { level?: string }
    totalProgress?: number
  }
  hotmart?: { engagement?: { accessCount?: number } }
}

const NOOP_OBSERVER: ScoreRecalculationObserver = {
  calculationFailed: () => undefined,
  writeFailed: () => undefined,
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function failedIndexes(cause: unknown, updateCount: number): ReadonlySet<number> | undefined {
  if (!isRecord(cause) || !Array.isArray(cause.writeErrors) || cause.writeErrors.length === 0) {
    return undefined
  }

  const indexes = new Set<number>()
  for (const writeError of cause.writeErrors) {
    if (!isRecord(writeError) || typeof writeError.index !== 'number') return undefined
    if (!Number.isInteger(writeError.index) || writeError.index < 0 || writeError.index >= updateCount) {
      return undefined
    }
    indexes.add(writeError.index)
  }
  return indexes
}

export class MongooseIndividualScoreRecalculationRepository
implements ScoreRecalculationRepository {
  constructor(private readonly observer: ScoreRecalculationObserver = NOOP_OBSERVER) {}

  async *streamByClass(classId: string): AsyncIterable<{
    id: string
    name?: string
    email?: string
    currentScore?: number
    currentLevel?: string
    accessCount?: number
    totalProgress?: number
  }> {
    const cursor = User.find({
      classId,
      'discord.isDeleted': { $ne: true },
      isDeleted: { $ne: true },
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        'combined.combinedEngagement': 1,
        'combined.engagement.level': 1,
        'combined.totalProgress': 1,
        'hotmart.engagement.accessCount': 1,
      })
      .sort({ _id: 1 })
      .lean<ScoreRecalculationProjection>()
      .cursor({ batchSize: SCORE_RECALCULATION_BATCH_SIZE })

    for await (const document of cursor) {
      yield {
        id: String(document._id),
        name: document.name,
        email: document.email,
        currentScore: document.combined?.combinedEngagement,
        currentLevel: document.combined?.engagement?.level,
        accessCount: document.hotmart?.engagement?.accessCount,
        totalProgress: document.combined?.totalProgress,
      }
    }
  }

  async persistBatch(
    updates: readonly ScoreRecalculationUpdate[],
  ): Promise<ScoreRecalculationBatchWrite> {
    if (updates.length === 0) {
      return { successfulIds: new Set<string>(), failedIds: new Set<string>() }
    }

    try {
      await User.bulkWrite(
        updates.map((update) => ({
          updateOne: {
            filter: { _id: update.learnerId },
            update: {
              $set: {
                'combined.combinedEngagement': update.score,
                'combined.engagement.score': update.score,
                'combined.engagement.level': update.level,
                'combined.calculatedAt': update.calculatedAt,
                'metadata.updatedAt': update.calculatedAt,
              },
            },
          },
        })),
        { ordered: false },
      )
      return {
        successfulIds: new Set(updates.map((update) => update.learnerId)),
        failedIds: new Set<string>(),
      }
    } catch (cause) {
      const indexes = failedIndexes(cause, updates.length)
      const failedIds = indexes === undefined
        ? new Set(updates.map((update) => update.learnerId))
        : new Set([...indexes].map((index) => updates[index].learnerId))
      const successfulIds = new Set(
        updates
          .map((update) => update.learnerId)
          .filter((learnerId) => !failedIds.has(learnerId)),
      )
      this.observer.writeFailed({ learnerIds: [...failedIds], cause })
      return { successfulIds, failedIds }
    }
  }
}
