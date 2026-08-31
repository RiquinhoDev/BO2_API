import ClarezaCoreGeneration from '../../../models/ClarezaCoreGeneration'
import ClarezaCorePublication from '../../../models/ClarezaCorePublication'
import type {
  CoreGenerationCandidate,
  CoreGenerationStore,
  PublicationResult,
  PublishedGenerationPointer,
} from './coreGeneration.types'

const POINTER_KEY = 'core'

type ErrorWithCode = { readonly code?: unknown }

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as ErrorWithCode).code === 11000
}

function decodeCandidate(value: {
  readonly generationId: string
  readonly universeVersion: string
  readonly dataVersion: string
  readonly createdAt: Date
  readonly records: CoreGenerationCandidate['records']
}): CoreGenerationCandidate {
  return {
    generationId: value.generationId,
    universeVersion: value.universeVersion,
    dataVersion: value.dataVersion,
    createdAt: value.createdAt,
    records: value.records,
  }
}

function publishedResult(value: {
  readonly currentGenerationId: string
  readonly previousGenerationId: string | null
  readonly revision: number
}): PublishedGenerationPointer {
  return {
    status: 'published',
    currentGenerationId: value.currentGenerationId,
    previousGenerationId: value.previousGenerationId,
    revision: value.revision,
  }
}

export class MongooseCoreGenerationStore implements CoreGenerationStore {
  async createCandidate(candidate: CoreGenerationCandidate): Promise<void> {
    await ClarezaCoreGeneration.create({
      ...candidate,
      recordCount: candidate.records.length,
      records: [...candidate.records],
    })
  }

  async readCandidate(generationId: string): Promise<CoreGenerationCandidate | null> {
    const found = await ClarezaCoreGeneration.findOne({ generationId }).lean()
    return found ? decodeCandidate(found) : null
  }

  async readPublished(): Promise<CoreGenerationCandidate | null> {
    const pointer = await ClarezaCorePublication.findOne({ key: POINTER_KEY }).lean()
    return pointer ? this.readCandidate(pointer.currentGenerationId) : null
  }

  async publishCandidate(
    generationId: string,
    expectedCurrentGenerationId: string | null,
  ): Promise<PublicationResult> {
    const candidate = await ClarezaCoreGeneration.findOne({ generationId }).lean()
    if (!candidate) return { status: 'missing' }

    const newerCandidate = await ClarezaCoreGeneration.exists({
      createdAt: { $gt: candidate.createdAt },
    })
    if (newerCandidate) return { status: 'conflict' }

    const current = await ClarezaCorePublication.findOne({ key: POINTER_KEY }).lean()
    if (current?.currentGenerationId === generationId) return publishedResult(current)

    if (!current) {
      if (expectedCurrentGenerationId !== null) return { status: 'conflict' }
      try {
        const created = await ClarezaCorePublication.create({
          key: POINTER_KEY,
          currentGenerationId: generationId,
          previousGenerationId: null,
          revision: 1,
          updatedAt: new Date(),
        })
        return publishedResult(created)
      } catch (error: unknown) {
        if (isDuplicateKey(error)) return { status: 'conflict' }
        throw error
      }
    }

    const updated = await ClarezaCorePublication.findOneAndUpdate({
      key: POINTER_KEY,
      currentGenerationId: expectedCurrentGenerationId,
      revision: current.revision,
    }, {
      $set: {
        currentGenerationId: generationId,
        previousGenerationId: expectedCurrentGenerationId,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    }, { new: true }).lean()

    return updated ? publishedResult(updated) : { status: 'conflict' }
  }

  async rollback(expectedCurrentGenerationId: string): Promise<PublicationResult> {
    const current = await ClarezaCorePublication.findOne({ key: POINTER_KEY }).lean()
    if (!current?.previousGenerationId) return { status: 'missing' }
    if (current.currentGenerationId !== expectedCurrentGenerationId) return { status: 'conflict' }

    const updated = await ClarezaCorePublication.findOneAndUpdate({
      key: POINTER_KEY,
      currentGenerationId: expectedCurrentGenerationId,
      revision: current.revision,
    }, {
      $set: {
        currentGenerationId: current.previousGenerationId,
        previousGenerationId: current.currentGenerationId,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    }, { new: true }).lean()

    return updated ? publishedResult(updated) : { status: 'conflict' }
  }

  async retainCandidates(limit: number): Promise<void> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError('candidate retention limit must be a non-negative integer')
    }

    const [pointer, newest] = await Promise.all([
      ClarezaCorePublication.findOne({ key: POINTER_KEY }).lean(),
      ClarezaCoreGeneration.find({}, 'generationId').sort({ createdAt: -1 }).limit(limit).lean(),
    ])
    const protectedIds = new Set(newest.map(entry => entry.generationId))
    if (pointer) {
      protectedIds.add(pointer.currentGenerationId)
      if (pointer.previousGenerationId) protectedIds.add(pointer.previousGenerationId)
    }
    await ClarezaCoreGeneration.deleteMany({
      generationId: { $nin: [...protectedIds] },
    })
  }
}
