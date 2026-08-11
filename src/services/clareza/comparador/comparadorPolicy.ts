import { isValidTicker, normalizeTicker } from '../tickerUtils'
import type {
  ComparadorSearchResponse,
  ComparadorSearchResult,
  ComparadorSnapshot,
  ComparadorSymbolsResponse,
} from './comparador.types'

export type ComparadorPolicyErrorCode = 'EMPTY_SYMBOLS' | 'SYMBOL_LIMIT_EXCEEDED' | 'INVALID_LIMIT'

export class ComparadorPolicyError extends Error {
  readonly code: ComparadorPolicyErrorCode

  constructor(code: ComparadorPolicyErrorCode, message: string) {
    super(message)
    this.name = 'ComparadorPolicyError'
    this.code = code
  }
}

const MAX_SEARCH_RESULTS = 20

function limitError(limit: number): ComparadorPolicyError {
  return new ComparadorPolicyError('SYMBOL_LIMIT_EXCEEDED', `Limite de ${limit} símbolos excedido.`)
}

export function parseComparadorSymbols(raw: string, limit: number): string[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ComparadorPolicyError('INVALID_LIMIT', 'O limite de símbolos tem de ser positivo.')
  }

  const symbols: string[] = []
  const seen = new Set<string>()

  for (const part of raw.split(',')) {
    const symbol = normalizeTicker(part)
    if (!symbol || !isValidTicker(symbol) || seen.has(symbol)) {
      continue
    }

    seen.add(symbol)
    symbols.push(symbol)
  }

  if (symbols.length === 0) {
    throw new ComparadorPolicyError('EMPTY_SYMBOLS', 'Sem símbolos válidos.')
  }

  if (symbols.length > limit) {
    throw limitError(limit)
  }

  return symbols
}

export function selectComparadorStocks(
  snapshot: ComparadorSnapshot,
  symbols: readonly string[],
): ComparadorSymbolsResponse {
  return {
    count: symbols.length,
    updated: snapshot.updated,
    companies: symbols.map((symbol) => snapshot.stocks[symbol] ?? {
      ticker: symbol,
      error: `${symbol} ainda não está disponível no Comparador.`,
    }),
  }
}

function searchRank(stock: ComparadorSearchResult, query: string): number | null {
  const symbol = stock.symbol.toUpperCase()
  const name = stock.name.toUpperCase()

  if (query === '') return 3
  if (symbol === query) return 0
  if (symbol.startsWith(query)) return 1
  if (name.startsWith(query)) return 2
  if (symbol.includes(query) || name.includes(query)) return 3

  return null
}

export function searchComparadorStocks(snapshot: ComparadorSnapshot, rawQuery: string): ComparadorSearchResponse {
  const query = rawQuery.trim().toUpperCase()
  const ranked = Object.values(snapshot.stocks)
    .map((stock) => {
      const result: ComparadorSearchResult = {
        symbol: stock.ticker,
        name: stock.name,
        sector: stock.sector,
        exchange: stock.exchange,
        image: stock.image,
        isReit: stock.isReit,
      }
      const rank = searchRank(result, query)
      return rank === null ? null : { rank, result }
    })
    .filter((entry): entry is { rank: number; result: ComparadorSearchResult } => entry !== null)
    .sort((left, right) => left.rank - right.rank || left.result.symbol.localeCompare(right.result.symbol))
    .map((entry) => entry.result)

  return {
    query,
    count: ranked.length,
    results: ranked.slice(0, MAX_SEARCH_RESULTS),
  }
}
