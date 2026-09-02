import ClarezaCoreEarningsCompanion from '../../../models/ClarezaCoreEarningsCompanion'
import type { CoreEarningsEvent, CoreEarningsSeries } from './coreEarningsProjection'
import type { CoreEarningsCompanionCollection } from './coreEarningsCompanionCollector'

const META_TICKER = '__META__'

function decodeEvents(value: unknown): CoreEarningsEvent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const row = item as Readonly<Record<string, unknown>>
    if (typeof row.date !== 'string') return []
    const numeric = (candidate: unknown): number | string | null => (
      typeof candidate === 'number' || typeof candidate === 'string' ? candidate : null
    )
    return [{
      date: row.date,
      epsEstimated: numeric(row.epsEstimated),
      epsActual: numeric(row.epsActual),
      reportedEPS: numeric(row.reportedEPS),
    }]
  })
}

export interface CoreEarningsCompanionGeneration {
  readonly generationId: string
  readonly createdAt: Date
  readonly series: readonly CoreEarningsSeries[]
  readonly errors: readonly { readonly ticker: string; readonly message: string }[]
}

export interface CoreEarningsCompanionStore {
  read(generationId: string): Promise<CoreEarningsCompanionGeneration | null>
  replace(collection: CoreEarningsCompanionCollection): Promise<void>
}

export class MongooseCoreEarningsCompanionStore implements CoreEarningsCompanionStore {
  async read(generationId: string): Promise<CoreEarningsCompanionGeneration | null> {
    const found = await ClarezaCoreEarningsCompanion.find({ generationId }).lean()
    const meta = found.find(item => item.ticker === META_TICKER)
    if (!meta) return null
    return {
      generationId,
      createdAt: meta.createdAt,
      errors: Array.isArray(meta.failures) ? meta.failures.flatMap(item => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
        const value = item as Readonly<Record<string, unknown>>
        return typeof value.ticker === 'string' && typeof value.message === 'string'
          ? [{ ticker: value.ticker, message: value.message }] : []
      }) : [],
      series: found.flatMap(item => item.ticker === META_TICKER ? [] : [{
        ticker: item.ticker,
        events: decodeEvents(item.events),
      }]),
    }
  }

  async replace(collection: CoreEarningsCompanionCollection): Promise<void> {
    const operations = collection.series.map(item => ({
      updateOne: {
        filter: { generationId: collection.generationId, ticker: item.ticker },
        update: { $setOnInsert: {
          generationId: collection.generationId, ticker: item.ticker,
          createdAt: collection.createdAt, events: [...(item.events ?? [])], failures: [],
        } },
        upsert: true,
      },
    }))
    if (operations.length) await ClarezaCoreEarningsCompanion.bulkWrite(operations, { ordered: false })
    await ClarezaCoreEarningsCompanion.updateOne({
      generationId: collection.generationId, ticker: META_TICKER,
    }, { $setOnInsert: {
      generationId: collection.generationId, ticker: META_TICKER,
      createdAt: collection.createdAt, events: [], failures: [...collection.errors],
    } }, { upsert: true })
  }

  async prune(retainedGenerationIds: readonly string[]): Promise<number> {
    if (!retainedGenerationIds.length) return 0
    const result = await ClarezaCoreEarningsCompanion.deleteMany({
      generationId: { $nin: [...retainedGenerationIds] },
    })
    return result.deletedCount ?? 0
  }
}
