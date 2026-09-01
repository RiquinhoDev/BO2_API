import {
  RefreshJobLeaseLostError,
  type RefreshJobExecutionContext,
} from '../operations/refreshJobCoordinator'

interface UniverseItem {
  readonly ticker: string
  readonly name: string
}

interface ProfilePayload {
  readonly p: Record<string, unknown>
}

export interface RaioxRefreshIndexEntry {
  readonly symbol: string
  readonly name: string
  readonly price: unknown
  readonly image: unknown
  readonly currency: unknown
  readonly exchange: unknown
  readonly country: unknown
}

interface ProcessRaioxUniverseOptions<TPayload extends ProfilePayload> {
  readonly universe: readonly UniverseItem[]
  readonly execution: RefreshJobExecutionContext
  readonly readCached: (ticker: string) => Promise<TPayload | null>
  readonly fetchCompany: (ticker: string) => Promise<TPayload | null>
  readonly persistCompany: (ticker: string, data: TPayload) => Promise<void>
  readonly onMissing: (ticker: string) => void
  readonly onError: (ticker: string, error: unknown) => void
}

export interface ProcessRaioxUniverseResult<TPayload extends ProfilePayload> {
  readonly errors: number
  readonly index: RaioxRefreshIndexEntry[]
  readonly snapshot: Record<string, TPayload>
}

function indexEntry<TPayload extends ProfilePayload>(stock: UniverseItem, data: TPayload): RaioxRefreshIndexEntry {
  return {
    symbol: stock.ticker,
    name: String(data.p.companyName ?? data.p.name ?? stock.name),
    price: data.p.price ?? null,
    image: data.p.image ?? null,
    currency: data.p.currency ?? null,
    exchange: data.p.exchangeShortName ?? data.p.exchange ?? null,
    country: data.p.country ?? null,
  }
}

export async function processRaioxUniverse<TPayload extends ProfilePayload>(
  options: ProcessRaioxUniverseOptions<TPayload>,
): Promise<ProcessRaioxUniverseResult<TPayload>> {
  const completed = new Set(options.execution.completedItems)
  const index: RaioxRefreshIndexEntry[] = []
  const snapshot: Record<string, TPayload> = {}
  let errors = 0

  for (const stock of options.universe) {
    try {
      const cached = completed.has(stock.ticker)
        ? await options.readCached(stock.ticker)
        : null
      const data = cached ?? await options.fetchCompany(stock.ticker)
      if (!data) {
        errors += 1
        options.onMissing(stock.ticker)
        continue
      }

      if (!cached) {
        await options.execution.assertLease()
        await options.persistCompany(stock.ticker, data)
        await options.execution.markCompleted(stock.ticker)
      }

      snapshot[stock.ticker] = data
      index.push(indexEntry(stock, data))
    } catch (error: unknown) {
      if (error instanceof RefreshJobLeaseLostError) throw error
      errors += 1
      options.onError(stock.ticker, error)
    }
  }

  return { errors, index, snapshot }
}
