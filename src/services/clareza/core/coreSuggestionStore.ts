import ClarezaSuggestionSubmission from '../../../models/ClarezaSuggestionSubmission'
import type { CoreSuggestionAdminStore } from './coreSuggestionAdmin'
import type { CoreSuggestionRecord, CoreSuggestionStore } from './coreSuggestionService'

type ErrorWithCode = { readonly code?: unknown }

interface AggregatedSuggestion {
  readonly _id: string
  readonly query: string
  readonly count: number
  readonly firstRequestedAt: Date
  readonly lastRequestedAt: Date
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as ErrorWithCode).code === 11000
}

function toRecord(value: AggregatedSuggestion): CoreSuggestionRecord {
  return {
    key: value._id,
    query: value.query,
    count: value.count,
    firstRequestedAt: value.firstRequestedAt.toISOString(),
    lastRequestedAt: value.lastRequestedAt.toISOString(),
    status: 'pending',
  }
}

const groupStage = {
  $group: {
    _id: '$key',
    query: { $first: '$query' },
    count: { $sum: 1 },
    firstRequestedAt: { $min: '$requestedAt' },
    lastRequestedAt: { $max: '$requestedAt' },
  },
} as const

export class MongooseCoreSuggestionStore implements CoreSuggestionStore, CoreSuggestionAdminStore {
  async increment(input: {
    readonly key: string
    readonly query: string
    readonly requestedAt: string
    readonly submissionId: string
  }): Promise<{ readonly record: CoreSuggestionRecord; readonly replayed: boolean }> {
    let replayed: boolean
    let key = input.key
    try {
      const result = await ClarezaSuggestionSubmission.updateOne({
        submissionId: input.submissionId,
      }, {
        $setOnInsert: {
          submissionId: input.submissionId,
          key: input.key,
          query: input.query,
          requestedAt: new Date(input.requestedAt),
        },
      }, { upsert: true })
      replayed = result.upsertedCount === 0
      if (replayed) {
        const previous = await ClarezaSuggestionSubmission.findOne({
          submissionId: input.submissionId,
        }).lean()
        if (!previous) throw new Error('suggestion replay is unavailable')
        key = previous.key
      }
    } catch (error: unknown) {
      if (!isDuplicateKey(error)) throw error
      replayed = true
      const previous = await ClarezaSuggestionSubmission.findOne({
        submissionId: input.submissionId,
      }).lean()
      if (!previous) throw error
      key = previous.key
    }
    return { record: await this.readAggregate(key), replayed }
  }

  async list(query: { readonly offset: number; readonly limit: number; readonly order: 'demand-desc' }) {
    const [countRows, rows] = await Promise.all([
      ClarezaSuggestionSubmission.aggregate<{ total: number }>([
        { $group: { _id: '$key' } },
        { $count: 'total' },
      ]),
      ClarezaSuggestionSubmission.aggregate<AggregatedSuggestion>([
        { $sort: { requestedAt: 1, submissionId: 1 } },
        groupStage,
        { $sort: { count: -1, lastRequestedAt: -1, _id: 1 } },
        { $skip: query.offset },
        { $limit: query.limit },
      ]),
    ])
    return { total: countRows[0]?.total ?? 0, items: rows.map(toRecord) }
  }

  private async readAggregate(key: string): Promise<CoreSuggestionRecord> {
    const rows = await ClarezaSuggestionSubmission.aggregate<AggregatedSuggestion>([
      { $match: { key } },
      { $sort: { requestedAt: 1, submissionId: 1 } },
      groupStage,
    ])
    const row = rows[0]
    if (!row) throw new Error('suggestion aggregation is unavailable')
    return toRecord(row)
  }
}
