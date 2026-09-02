import ClarezaCoreAliasState from '../../../models/ClarezaCoreAliasState'
import type { CoreAliasState } from './coreAliasMaintenance'

type ErrorWithCode = { readonly code?: unknown }

const isDuplicateKey = (error: unknown): boolean => (
  typeof error === 'object' && error !== null && (error as ErrorWithCode).code === 11000
)

export class CoreAliasRevisionConflictError extends Error {
  readonly code = 'CLAREZA_ALIAS_REVISION_CONFLICT'

  constructor() {
    super('core alias state revision conflict')
    this.name = 'CoreAliasRevisionConflictError'
  }
}

export interface CoreAliasSnapshot {
  readonly revision: number
  readonly state: CoreAliasState
}

export interface CoreAliasReader {
  read(): Promise<CoreAliasSnapshot>
}

export class MongooseCoreAliasStore implements CoreAliasReader {
  async read(): Promise<CoreAliasSnapshot> {
    const found = await ClarezaCoreAliasState.findOne({ key: 'core' }).lean()
    if (!found) return { revision: 0, state: { aliases: [], processed: [], failures: [], conflicts: [] } }
    return {
      revision: found.revision,
      state: {
        aliases: found.aliases, processed: found.processed,
        failures: found.failures ?? [], conflicts: found.conflicts ?? [],
      },
    }
  }

  async replace(state: CoreAliasState, expectedRevision: number): Promise<number> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new RangeError('expected alias revision must be a non-negative integer')
    }
    try {
      const updated = await ClarezaCoreAliasState.findOneAndUpdate({
        key: 'core', revision: expectedRevision,
      }, {
        $set: {
          aliases: [...state.aliases], processed: [...state.processed],
          failures: [...state.failures], conflicts: [...state.conflicts], updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      }, { upsert: true, new: true }).lean()
      if (!updated) throw new CoreAliasRevisionConflictError()
      return updated.revision
    } catch (error: unknown) {
      if (isDuplicateKey(error)) throw new CoreAliasRevisionConflictError()
      throw error
    }
  }
}
