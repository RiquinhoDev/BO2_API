import type {
  CoreCollectionRun,
  CoreCollectionRunStore,
  CoreRunFailure,
  CreateCoreRunInput,
} from './coreCollectionRun.types'

export type CoreItemResult =
  | { readonly status: 'success'; readonly data?: unknown }
  | { readonly status: 'failure'; readonly errorCode: string }

export type CoreItemProcessor = (key: string) => Promise<CoreItemResult>

interface CoreCollectionRunnerOptions {
  readonly batchSize: number
  readonly leaseMs: number
}

function processorErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code
    if (typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(code)) return code
  }
  return 'processor-error'
}

export class CoreCollectionRunner {
  constructor(
    private readonly store: CoreCollectionRunStore,
    private readonly processor: CoreItemProcessor,
    private readonly options: CoreCollectionRunnerOptions,
  ) {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
      throw new RangeError('collection batch size must be an integer between 1 and 100')
    }
    if (!Number.isInteger(options.leaseMs) || options.leaseMs < 1_000 || options.leaseMs > 900_000) {
      throw new RangeError('collection lease must be between 1000 and 900000 milliseconds')
    }
  }

  create(input: CreateCoreRunInput): Promise<CoreCollectionRun> {
    if (!input.itemKeys.length) throw new RangeError('collection run requires items')
    if (new Set(input.itemKeys).size !== input.itemKeys.length) {
      throw new RangeError('collection run item keys must be unique')
    }
    return this.store.create(input)
  }

  async executeNext(runId: string, ownerId: string, now: Date): Promise<CoreCollectionRun> {
    const claimed = await this.store.claim(runId, ownerId, now, this.options.leaseMs)
    if (!claimed) throw new Error('collection run lease unavailable')
    const end = Math.min(claimed.nextIndex + this.options.batchSize, claimed.itemKeys.length)
    const keys = claimed.itemKeys.slice(claimed.nextIndex, end)
    const results = await Promise.all(keys.map(async key => {
      try {
        return { key, result: await this.processor(key) }
      } catch (error: unknown) {
        return { key, result: { status: 'failure', errorCode: processorErrorCode(error) } as const }
      }
    }))
    const successfulItems = results.filter(entry => entry.result.status === 'success').map(entry => entry.key)
    const collectedItems = results.flatMap(entry => (
      entry.result.status === 'success' && 'data' in entry.result
        ? [{ key: entry.key, data: entry.result.data }]
        : []
    ))
    const failedItems: CoreRunFailure[] = results.flatMap(entry => (
      entry.result.status === 'failure' ? [{ key: entry.key, errorCode: entry.result.errorCode }] : []
    ))
    const updated = await this.store.completeBatch({
      runId, ownerId, expectedRevision: claimed.revision,
      nextIndex: end, successfulItems, collectedItems, failedItems,
      completed: end === claimed.itemKeys.length, now,
    })
    if (!updated) throw new Error('collection run checkpoint conflict')
    return updated
  }
}
