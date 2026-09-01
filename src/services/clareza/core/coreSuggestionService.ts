export interface CoreSuggestionRecord {
  readonly key: string
  readonly query: string
  readonly count: number
  readonly firstRequestedAt: string
  readonly lastRequestedAt: string
  readonly status: 'pending' | 'covered' | 'dismissed'
}

export interface CoreSuggestionStore {
  increment(input: {
    readonly key: string
    readonly query: string
    readonly requestedAt: string
    readonly submissionId: string
  }): Promise<{ readonly record: CoreSuggestionRecord; readonly replayed: boolean }>
}

export interface CoreSuggestionServiceDependencies {
  readonly store: CoreSuggestionStore
  readonly knownTickers: readonly string[]
  readonly now: () => string
}

export class CoreSuggestionValidationError extends Error {
  readonly code = 'CLAREZA_SUGGESTION_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'CoreSuggestionValidationError'
  }
}

function normalizeQuery(rawQuery: string): string {
  const query = rawQuery.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  const length = [...query].length
  const hasControlCharacter = [...query].some(character => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
  if (length < 1 || length > 80 || hasControlCharacter) {
    throw new CoreSuggestionValidationError('suggestion must contain between 1 and 80 safe characters')
  }
  return query
}

function validateSubmissionId(submissionId: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(submissionId)) {
    throw new CoreSuggestionValidationError('suggestion submission id is invalid')
  }
}

export function createCoreSuggestionService(dependencies: CoreSuggestionServiceDependencies) {
  const known = new Set(dependencies.knownTickers.map(ticker => ticker.trim().toUpperCase()))
  return {
    async submit(rawQuery: string, submissionId: string) {
      const query = normalizeQuery(rawQuery)
      validateSubmissionId(submissionId)
      const key = query.toLocaleUpperCase('pt-PT')
      if (known.has(key)) return { outcome: 'known' as const, ticker: key }
      const requestedAt = dependencies.now()
      if (Number.isNaN(new Date(requestedAt).getTime())) {
        throw new RangeError('suggestion clock returned an invalid timestamp')
      }
      const result = await dependencies.store.increment({ key, query, requestedAt, submissionId })
      return {
        outcome: result.replayed ? 'replayed' as const : 'accepted' as const,
        record: result.record,
      }
    },
  }
}
