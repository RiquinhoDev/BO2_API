import ClarezaCoreCollectionRun from '../../../models/ClarezaCoreCollectionRun'
import type {
  CompleteCoreBatchInput,
  CoreCollectionRun,
  CoreCollectionRunStore,
  CreateCoreRunInput,
} from './coreCollectionRun.types'

function decode(value: CoreCollectionRun): CoreCollectionRun {
  return {
    runId: value.runId,
    generationId: value.generationId,
    universeVersion: value.universeVersion,
    itemKeys: [...value.itemKeys],
    status: value.status,
    nextIndex: value.nextIndex,
    successfulItems: [...value.successfulItems],
    failedItems: value.failedItems.map(failure => ({ ...failure })),
    ownerId: value.ownerId,
    leaseUntil: value.leaseUntil,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

export class MongooseCoreCollectionRunStore implements CoreCollectionRunStore {
  async create(input: CreateCoreRunInput): Promise<CoreCollectionRun> {
    const created = await ClarezaCoreCollectionRun.create({
      runId: input.runId,
      generationId: input.generationId,
      universeVersion: input.universeVersion,
      itemKeys: [...input.itemKeys],
      status: 'pending',
      nextIndex: 0,
      successfulItems: [],
      failedItems: [],
      ownerId: null,
      leaseUntil: null,
      revision: 0,
      createdAt: input.now,
      updatedAt: input.now,
    })
    return decode(created.toObject() as CoreCollectionRun)
  }

  async read(runId: string): Promise<CoreCollectionRun | null> {
    const found = await ClarezaCoreCollectionRun.findOne({ runId }).lean()
    return found ? decode(found as CoreCollectionRun) : null
  }

  async claim(
    runId: string,
    ownerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<CoreCollectionRun | null> {
    const claimed = await ClarezaCoreCollectionRun.findOneAndUpdate({
      runId,
      status: { $in: ['pending', 'running'] },
      $or: [
        { ownerId },
        { ownerId: null },
        { leaseUntil: null },
        { leaseUntil: { $lte: now } },
      ],
    }, {
      $set: {
        status: 'running', ownerId,
        leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now,
      },
      $inc: { revision: 1 },
    }, { new: true }).lean()
    return claimed ? decode(claimed as CoreCollectionRun) : null
  }

  async completeBatch(input: CompleteCoreBatchInput): Promise<CoreCollectionRun | null> {
    const updated = await ClarezaCoreCollectionRun.findOneAndUpdate({
      runId: input.runId,
      ownerId: input.ownerId,
      revision: input.expectedRevision,
      status: 'running',
    }, {
      $set: {
        nextIndex: input.nextIndex,
        status: input.completed ? 'completed' : 'running',
        ownerId: input.completed ? null : input.ownerId,
        leaseUntil: input.completed ? null : undefined,
        updatedAt: input.now,
      },
      $push: {
        successfulItems: { $each: [...input.successfulItems] },
        failedItems: { $each: [...input.failedItems] },
      },
      $inc: { revision: 1 },
    }, { new: true }).lean()
    return updated ? decode(updated as CoreCollectionRun) : null
  }
}
