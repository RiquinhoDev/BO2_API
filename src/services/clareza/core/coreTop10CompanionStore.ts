import ClarezaCoreTop10Companion from '../../../models/ClarezaCoreTop10Companion'
import type { CoreTop10CompanionCollection } from './coreTop10CompanionCollector'
import type { CoreTop10History } from './coreTop10Projection'

const META_TICKER = '__META__'

export interface CoreTop10CompanionGeneration {
  readonly generationId: string
  readonly createdAt: Date
  readonly histories: readonly CoreTop10History[]
  readonly errors: readonly { readonly ticker: string; readonly message: string }[]
}

export interface CoreTop10CompanionStore {
  read(generationId: string): Promise<CoreTop10CompanionGeneration | null>
  replace(collection: CoreTop10CompanionCollection): Promise<void>
}

const decodePoints = (value: unknown): CoreTop10History['points'] => !Array.isArray(value) ? [] : value.flatMap(item => {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
  const row = item as Readonly<Record<string, unknown>>
  return typeof row.date === 'string' && typeof row.close === 'number' && Number.isFinite(row.close)
    ? [{ date: row.date, close: row.close }] : []
})

export class MongooseCoreTop10CompanionStore implements CoreTop10CompanionStore {
  async read(generationId: string): Promise<CoreTop10CompanionGeneration | null> {
    const found = await ClarezaCoreTop10Companion.find({ generationId }).lean()
    const meta = found.find(item => item.ticker === META_TICKER)
    if (!meta) return null
    const errors = Array.isArray(meta.failures) ? meta.failures.flatMap(item => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
      const row = item as Readonly<Record<string, unknown>>
      return typeof row.ticker === 'string' && typeof row.message === 'string'
        ? [{ ticker: row.ticker, message: row.message }] : []
    }) : []
    return {
      generationId, createdAt: meta.createdAt, errors,
      histories: found.flatMap(item => item.ticker === META_TICKER ? [] : [{
        ticker: item.ticker, points: decodePoints(item.points),
      }]),
    }
  }

  async replace(collection: CoreTop10CompanionCollection): Promise<void> {
    const operations = collection.histories.map(item => ({ updateOne: {
      filter: { generationId: collection.generationId, ticker: item.ticker },
      update: { $setOnInsert: {
        generationId: collection.generationId, ticker: item.ticker,
        createdAt: collection.createdAt, points: [...item.points], failures: [],
      } }, upsert: true,
    } }))
    if (operations.length) await ClarezaCoreTop10Companion.bulkWrite(operations, { ordered: false })
    await ClarezaCoreTop10Companion.updateOne({
      generationId: collection.generationId, ticker: META_TICKER,
    }, { $setOnInsert: {
      generationId: collection.generationId, ticker: META_TICKER,
      createdAt: collection.createdAt, points: [], failures: [...collection.errors],
    } }, { upsert: true })
  }
}
