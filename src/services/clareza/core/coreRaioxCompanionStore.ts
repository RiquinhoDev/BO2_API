import ClarezaCoreRaioxCompanion from '../../../models/ClarezaCoreRaioxCompanion'
import type { CoreRaioxComplementSource } from './coreRaioxComposition'
import type { CoreRaioxCompanionCollection } from './coreRaioxCompanionCollector'

const META_TICKER = '__META__'

function record(value: unknown): CoreRaioxComplementSource | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as CoreRaioxComplementSource
    : null
}

export interface CoreRaioxCompanionGeneration {
  readonly generationId: string
  readonly sectorPe: readonly unknown[]
  readonly companions: Readonly<Record<string, CoreRaioxComplementSource>>
}

export interface CoreRaioxCompanionStore {
  read(generationId: string): Promise<CoreRaioxCompanionGeneration | null>
  replace(collection: CoreRaioxCompanionCollection): Promise<void>
}

export class MongooseCoreRaioxCompanionStore implements CoreRaioxCompanionStore {
  async read(generationId: string): Promise<CoreRaioxCompanionGeneration | null> {
    const found = await ClarezaCoreRaioxCompanion.find({ generationId }).lean()
    const meta = found.find(item => item.ticker === META_TICKER)
    if (!meta) return null
    const companions = Object.fromEntries(found.flatMap(item => {
      const data = item.ticker === META_TICKER ? null : record(item.data)
      return data ? [[item.ticker, data] as const] : []
    }))
    return {
      generationId,
      sectorPe: Array.isArray(meta.sectorPe) ? meta.sectorPe : [],
      companions,
    }
  }

  async replace(collection: CoreRaioxCompanionCollection): Promise<void> {
    const operations = Object.entries(collection.companions).map(([ticker, data]) => ({
      updateOne: {
        filter: { generationId: collection.generationId, ticker },
        update: { $setOnInsert: {
          generationId: collection.generationId, ticker,
          createdAt: collection.createdAt, data, sectorPe: [],
        } },
        upsert: true,
      },
    }))
    if (operations.length) await ClarezaCoreRaioxCompanion.bulkWrite(operations, { ordered: false })
    await ClarezaCoreRaioxCompanion.updateOne({
      generationId: collection.generationId, ticker: META_TICKER,
    }, { $setOnInsert: {
      generationId: collection.generationId,
      ticker: META_TICKER,
      createdAt: collection.createdAt,
      data: null,
      sectorPe: [...collection.sectorPe],
    } }, { upsert: true })
  }
}
