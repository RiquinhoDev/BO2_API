import { searchComparadorStocks, selectComparadorStocks, parseComparadorSymbols } from './comparadorPolicy'
import type { ComparadorFmpPort } from './comparadorFmpClient'
import type { ComparadorStorePort } from './comparadorStore'
import type {
  ComparadorRefreshReport,
  ComparadorSearchResponse,
  ComparadorSnapshot,
  ComparadorStock,
  ComparadorSymbolsResponse,
} from './comparador.types'

const MAX_COMPARISON_SYMBOLS = 4
const MAX_MANUAL_REFRESH_SYMBOLS = 10

export interface ComparadorFullRefreshReport {
  readonly total: number
  readonly errors: number
}

export interface ComparadorService {
  getComparadorSymbols(rawSymbols: string): Promise<ComparadorSymbolsResponse>
  searchComparador(rawQuery: string): Promise<ComparadorSearchResponse>
  refreshComparadorSymbols(rawSymbols: string): Promise<ComparadorRefreshReport>
  refreshClarezaComparadorData(): Promise<ComparadorFullRefreshReport>
}

export interface ComparadorServiceDependencies {
  readonly store: ComparadorStorePort
  readonly fmp: ComparadorFmpPort
  readonly universe: readonly string[]
  readonly concurrency: number
  readonly now: () => string
  readonly assertFmpAvailable: () => void
}

export type ComparadorServiceErrorCode = 'INVALID_CONCURRENCY'

export class ComparadorServiceError extends Error {
  readonly code: ComparadorServiceErrorCode

  constructor(code: ComparadorServiceErrorCode, message: string) {
    super(message)
    this.name = 'ComparadorServiceError'
    this.code = code
  }
}

function emptySnapshot(): ComparadorSnapshot {
  return { updated: null, stocks: {} }
}

function isRefreshable(stock: ComparadorStock | null): stock is ComparadorStock {
  return stock !== null && stock.price !== null
}

async function runWithConcurrency(
  tasks: readonly (() => Promise<void>)[],
  concurrency: number,
): Promise<void> {
  let nextTask = 0

  async function worker(): Promise<void> {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask]
      nextTask += 1
      if (task) await task()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
}

export function createComparadorService(dependencies: ComparadorServiceDependencies): ComparadorService {
  if (!Number.isInteger(dependencies.concurrency) || dependencies.concurrency < 1) {
    throw new ComparadorServiceError('INVALID_CONCURRENCY', 'A concorrência tem de ser positiva.')
  }

  async function readSnapshot(): Promise<ComparadorSnapshot> {
    return (await dependencies.store.read()) ?? emptySnapshot()
  }

  async function refresh(
    symbols: readonly string[],
    existingSnapshot: ComparadorSnapshot,
    mergeExisting: boolean,
  ): Promise<{ readonly snapshot: ComparadorSnapshot; readonly updated: string[]; readonly failed: string[] }> {
    const results = new Map<string, ComparadorStock | null>()
    const tasks = symbols.map((symbol) => async () => {
      try {
        results.set(symbol, await dependencies.fmp.fetchCompany(symbol))
      } catch {
        results.set(symbol, null)
      }
    })

    await runWithConcurrency(tasks, dependencies.concurrency)

    const stocks: Record<string, ComparadorStock> = mergeExisting ? { ...existingSnapshot.stocks } : {}
    const updated: string[] = []
    const failed: string[] = []
    for (const symbol of symbols) {
      const stock = results.get(symbol) ?? null
      if (isRefreshable(stock)) {
        stocks[symbol] = stock
        updated.push(symbol)
      } else {
        failed.push(symbol)
      }
    }

    return {
      snapshot: { updated: dependencies.now(), stocks },
      updated,
      failed,
    }
  }

  return {
    async getComparadorSymbols(rawSymbols: string): Promise<ComparadorSymbolsResponse> {
      const symbols = parseComparadorSymbols(rawSymbols, MAX_COMPARISON_SYMBOLS)
      return selectComparadorStocks(await readSnapshot(), symbols)
    },

    async searchComparador(rawQuery: string): Promise<ComparadorSearchResponse> {
      return searchComparadorStocks(await readSnapshot(), rawQuery)
    },

    async refreshComparadorSymbols(rawSymbols: string): Promise<ComparadorRefreshReport> {
      dependencies.assertFmpAvailable()
      const symbols = parseComparadorSymbols(rawSymbols, MAX_MANUAL_REFRESH_SYMBOLS)
      const result = await refresh(symbols, await readSnapshot(), true)
      await dependencies.store.write(result.snapshot, result.failed.length)
      return { ok: true, updated: result.updated, failed: result.failed }
    },

    async refreshClarezaComparadorData(): Promise<ComparadorFullRefreshReport> {
      dependencies.assertFmpAvailable()
      const result = await refresh(dependencies.universe, emptySnapshot(), false)
      await dependencies.store.write(result.snapshot, result.failed.length)
      return { total: result.updated.length, errors: result.failed.length }
    },
  }
}
