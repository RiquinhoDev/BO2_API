type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreAnalystConsensusDataset {
  readonly ticker: string
  readonly gradesConsensus: JsonRecord | null
  readonly priceTargetConsensus: JsonRecord | null
  readonly updatedAt: string
}

export interface CoreAnalystConsensusStore {
  read(ticker: string): Promise<CoreAnalystConsensusDataset | null>
  write(dataset: CoreAnalystConsensusDataset): Promise<void>
}

export interface CoreAnalystConsensusCollector {
  collect(ticker: string): Promise<{
    readonly gradesConsensus: JsonRecord | null
    readonly priceTargetConsensus: JsonRecord | null
  }>
}

export type CoreAnalystConsensusConsumer = 'comparador' | 'raiox'
export type CoreAnalystConsensusResult =
  | { readonly outcome: 'fresh' | 'refreshed'; readonly dataset: CoreAnalystConsensusDataset; readonly diagnostic: string | null }
  | { readonly outcome: 'preserved'; readonly dataset: CoreAnalystConsensusDataset; readonly diagnostic: 'collection-empty' | 'collection-error' }
  | { readonly outcome: 'unavailable'; readonly dataset: null; readonly diagnostic: 'collection-empty' | 'collection-error' }

const normalize = (ticker: string): string => ticker.trim().toUpperCase()

function isFresh(dataset: CoreAnalystConsensusDataset, now: Date, maxAgeMs: number): boolean {
  const updatedAt = new Date(dataset.updatedAt).getTime()
  const age = now.getTime() - updatedAt
  return Number.isFinite(updatedAt) && age >= 0 && age <= maxAgeMs
}

export class CoreAnalystConsensusCoordinator {
  private readonly inFlight = new Map<string, Promise<CoreAnalystConsensusResult>>()

  constructor(
    private readonly store: CoreAnalystConsensusStore,
    private readonly collector: CoreAnalystConsensusCollector,
  ) {}

  get(
    rawTicker: string,
    consumer: CoreAnalystConsensusConsumer,
    now: Date,
    maxAgeMs: number,
  ): Promise<CoreAnalystConsensusResult> {
    const ticker = normalize(rawTicker)
    if (!ticker) return Promise.reject(new TypeError('analyst consensus ticker is required'))
    if (!Number.isFinite(now.getTime()) || !Number.isInteger(maxAgeMs) || maxAgeMs < 1) {
      return Promise.reject(new RangeError('analyst consensus freshness policy is invalid'))
    }
    void consumer
    const existing = this.inFlight.get(ticker)
    if (existing) return existing
    const task = this.resolve(ticker, now, maxAgeMs)
    const tracked = task.finally(() => {
      if (this.inFlight.get(ticker) === tracked) this.inFlight.delete(ticker)
    })
    this.inFlight.set(ticker, tracked)
    return tracked
  }

  private async resolve(
    ticker: string,
    now: Date,
    maxAgeMs: number,
  ): Promise<CoreAnalystConsensusResult> {
    const previous = await this.store.read(ticker)
    if (previous && isFresh(previous, now, maxAgeMs)) {
      return { outcome: 'fresh', dataset: previous, diagnostic: null }
    }
    let collected: Awaited<ReturnType<CoreAnalystConsensusCollector['collect']>>
    try {
      collected = await this.collector.collect(ticker)
    } catch {
      return previous
        ? { outcome: 'preserved', dataset: previous, diagnostic: 'collection-error' }
        : { outcome: 'unavailable', dataset: null, diagnostic: 'collection-error' }
    }
    if (!collected.gradesConsensus && !collected.priceTargetConsensus) {
      return previous
        ? { outcome: 'preserved', dataset: previous, diagnostic: 'collection-empty' }
        : { outcome: 'unavailable', dataset: null, diagnostic: 'collection-empty' }
    }
    const dataset: CoreAnalystConsensusDataset = {
      ticker,
      gradesConsensus: collected.gradesConsensus ?? previous?.gradesConsensus ?? null,
      priceTargetConsensus: collected.priceTargetConsensus ?? previous?.priceTargetConsensus ?? null,
      updatedAt: now.toISOString(),
    }
    await this.store.write(dataset)
    const diagnostic = collected.gradesConsensus && collected.priceTargetConsensus
      ? null
      : 'collection-partial'
    return { outcome: 'refreshed', dataset, diagnostic }
  }
}
