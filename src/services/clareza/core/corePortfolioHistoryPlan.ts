import type { CoreAssetKind } from './coreGeneration.types'

export interface PortfolioHistoryUniverseItem {
  readonly ticker: string
  readonly kind: CoreAssetKind
}

export interface PortfolioHistoryAvailability {
  readonly ticker: string
  readonly annualIncome: boolean
  readonly quarterlyIncome: boolean
  readonly earnings: boolean
}

export interface PortfolioHistoryRequestPolicy {
  readonly maxSymbols: number
  readonly maxInputLength: number
  readonly missingDatasetAction: 'unavailable' | 'enqueue'
}

export type PortfolioHistoryRejectionReason =
  | 'unknown-symbol'
  | 'unsupported-kind'
  | 'datasets-unavailable'

export interface PortfolioHistoryRequestPlan {
  readonly requested: readonly string[]
  readonly ready: readonly string[]
  readonly pending: readonly string[]
  readonly rejected: readonly {
    readonly ticker: string
    readonly reason: PortfolioHistoryRejectionReason
  }[]
}

export class PortfolioHistoryRequestLimitError extends Error {
  readonly code = 'CLAREZA_PORTFOLIO_HISTORY_REQUEST_LIMIT'

  constructor(message: string) {
    super(message)
    this.name = 'PortfolioHistoryRequestLimitError'
  }
}

const normalizedTicker = (ticker: string): string => ticker.trim().toUpperCase()

function validatePolicy(policy: PortfolioHistoryRequestPolicy): void {
  if (!Number.isInteger(policy.maxSymbols) || policy.maxSymbols < 1
    || !Number.isInteger(policy.maxInputLength) || policy.maxInputLength < 1) {
    throw new RangeError('portfolio history request policy limits must be positive integers')
  }
}

export function planPortfolioHistoryRequest(
  rawSymbols: string,
  universe: readonly PortfolioHistoryUniverseItem[],
  availability: readonly PortfolioHistoryAvailability[],
  policy: PortfolioHistoryRequestPolicy,
): PortfolioHistoryRequestPlan {
  validatePolicy(policy)
  if (rawSymbols.length > policy.maxInputLength) {
    throw new PortfolioHistoryRequestLimitError('portfolio history input exceeds maximum length')
  }
  const requested = [...new Set(rawSymbols.split(',').map(normalizedTicker).filter(Boolean))]
  if (requested.length > policy.maxSymbols) {
    throw new PortfolioHistoryRequestLimitError('portfolio history request exceeds symbol limit')
  }
  const universeByTicker = new Map(universe.map(item => [normalizedTicker(item.ticker), item]))
  const availabilityByTicker = new Map(availability.map(item => [normalizedTicker(item.ticker), item]))
  const ready: string[] = []
  const pending: string[] = []
  const rejected: PortfolioHistoryRequestPlan['rejected'][number][] = []
  for (const ticker of requested) {
    const asset = universeByTicker.get(ticker)
    if (!asset) {
      rejected.push({ ticker, reason: 'unknown-symbol' })
      continue
    }
    if (asset.kind !== 'stock' && asset.kind !== 'reit') {
      rejected.push({ ticker, reason: 'unsupported-kind' })
      continue
    }
    const datasets = availabilityByTicker.get(ticker)
    if (datasets?.annualIncome && datasets.quarterlyIncome && datasets.earnings) {
      ready.push(ticker)
      continue
    }
    if (policy.missingDatasetAction === 'enqueue') pending.push(ticker)
    else rejected.push({ ticker, reason: 'datasets-unavailable' })
  }
  return { requested, ready, pending, rejected }
}

export type CoreHistoryEnqueuePort = (ticker: string) => Promise<void>

export class CoreHistoryEnqueueCoordinator {
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(private readonly port: CoreHistoryEnqueuePort) {}

  enqueue(rawTicker: string): Promise<void> {
    const ticker = normalizedTicker(rawTicker)
    if (!ticker) return Promise.reject(new TypeError('history enqueue ticker is required'))
    const existing = this.inFlight.get(ticker)
    if (existing) return existing
    let task: Promise<void>
    try {
      task = Promise.resolve(this.port(ticker))
    } catch (error) {
      task = Promise.reject(error)
    }
    const tracked = task.finally(() => {
      if (this.inFlight.get(ticker) === tracked) this.inFlight.delete(ticker)
    })
    this.inFlight.set(ticker, tracked)
    return tracked
  }
}
