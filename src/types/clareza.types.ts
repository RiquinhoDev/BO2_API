export interface ClarezaHistoricalPoint {
  date: string
  close: number
}

export type ClarezaFmpRecord = Record<string, unknown> & {
  symbol?: string
  companyName?: string
  sector?: string
  industry?: string
  currency?: string
  exchangeShortName?: string
  exchange?: string
  range?: string
  calendarYear?: string | number
  year?: string | number
  date?: string
  peersList?: string[]
}

export interface ClarezaStockData extends ClarezaFmpRecord {
  change?: number | null
  pe?: number | null
  peg?: number | null
  pb?: number | null
  evEbitda?: number | null
  grossMarginTTM?: number | null
  netMargin?: number | null
  roe?: number | null
  debtEbitda?: number | null
  pFfo?: number | null
  ffoYield?: number | null
  ffoPayoutRatio?: number | null
  payoutRatio?: number | null
  updated?: string
}

export interface ClarezaStockEntry {
  ticker: string
  name: string
  type: string
  sector: string
  data: ClarezaStockData | null
}

export interface ClarezaEarningsEntry {
  t: string
  d: string
  e: number | null
  c: string
  lr?: {
    d: string
    r: number | null
    e: number | null
    b: boolean | null
  }
}

export interface ClarezaEarningsPayload {
  updated: string
  window: { from: string; to: string }
  count: number
  earnings: ClarezaEarningsEntry[]
}

export interface ClarezaTop10Profile extends Record<string, unknown> {
  price?: unknown
  changesPercentage?: unknown
  changePercentage?: unknown
  marketCap?: unknown
  isActivelyTrading?: unknown
}

export interface ClarezaTop10StockPayload extends Record<string, unknown> {
  profile: ClarezaTop10Profile
  ratios: Record<string, unknown>
  keyMetrics: Record<string, unknown>
  historical: ClarezaHistoricalPoint[]
  updated: string
  ipoInfo?: Record<string, unknown>
  isPrivate?: boolean
}

export interface ClarezaTop10Payload {
  updated: string
  source: string
  revision: string
  stocks: Record<string, ClarezaTop10StockPayload>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasProviderError(value: unknown): boolean {
  return isRecord(value) && 'Error Message' in value
}
