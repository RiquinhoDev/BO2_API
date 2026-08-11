export interface ComparadorStock {
  readonly ticker: string
  readonly name: string
  readonly image: string | null
  readonly sector: string | null
  readonly industry: string | null
  readonly country: string | null
  readonly currency: string
  readonly exchange: string | null
  readonly isReit: boolean
  readonly price: number | null
  readonly change: number | null
  readonly perf12m: number | null
  readonly marketCap: number | null
  readonly beta: number | null
  readonly pe: number | null
  readonly peg: number | null
  readonly ps: number | null
  readonly pb: number | null
  readonly evEbitda: number | null
  readonly pFfo: number | null
  readonly grossMargin: number | null
  readonly netMargin: number | null
  readonly roe: number | null
  readonly roic: number | null
  readonly fcfYield: number | null
  readonly debtEquity: number | null
  readonly debtEbitda: number | null
  readonly dividendYield: number | null
  readonly payoutRatio: number | null
  readonly ffoPayout: number | null
  readonly analystConsensus: string | null
  readonly strongBuy: number | null
  readonly buy: number | null
  readonly hold: number | null
  readonly sell: number | null
  readonly strongSell: number | null
  readonly targetConsensus: number | null
  readonly upside: number | null
  readonly updated: string
}

export interface ComparadorSnapshot {
  readonly updated: string | null
  readonly stocks: Readonly<Record<string, ComparadorStock>>
}

export interface ComparadorRefreshReport {
  readonly ok: true
  readonly updated: readonly string[]
  readonly failed: readonly string[]
}

export interface ComparadorUnavailableStock {
  readonly ticker: string
  readonly error: string
}

export interface ComparadorSymbolsResponse {
  readonly count: number
  readonly updated: string | null
  readonly companies: readonly (ComparadorStock | ComparadorUnavailableStock)[]
}

export interface ComparadorSearchResult {
  readonly symbol: string
  readonly name: string
  readonly sector: string | null
  readonly exchange: string | null
  readonly image: string | null
  readonly isReit: boolean
}

export interface ComparadorSearchResponse {
  readonly query: string
  readonly count: number
  readonly results: readonly ComparadorSearchResult[]
}
