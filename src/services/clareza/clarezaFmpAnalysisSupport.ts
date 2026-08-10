import axios from 'axios'
import { fmpThrottle } from './fmpThrottle'
import { getFmpApiKey } from '../requestDrivenRuntimeConfig'

type FmpNumericField =
  | 'price'
  | 'changePercentage'
  | 'marketCap'
  | 'beta'
  | 'sharesOutstanding'
  | 'sharesOut'
  | 'netIncome'
  | 'depreciationAndAmortization'
  | 'weightedAverageShsOut'
  | 'weightedAverageShsOutDil'
  | 'netDividendsPaid'
  | 'dividendsPaid'
  | 'capitalExpenditure'
  | 'adjDividend'
  | 'dividend'
  | 'stockPrice'
  | 'revenue'
  | 'ebitda'
  | 'grossProfit'
  | 'operatingIncome'
  | 'eps'
  | 'epsdiluted'
  | 'totalStockholdersEquity'
  | 'cashAndShortTermInvestments'
  | 'totalDebt'
  | 'totalDebtAndCapitalLeaseObligations'
  | 'shortTermDebt'
  | 'longTermDebt'
  | 'netDebt'
  | 'totalCurrentAssets'
  | 'totalCurrentLiabilities'
  | 'lastDividend'
  | 'lastDiv'
  | 'lastMonthAvgPriceTarget'
  | 'allTimeAvgPriceTarget'
  | 'targetConsensus'
  | 'priceTarget'
  | 'priceToEarningsRatioTTM'
  | 'forwardPriceToEarningsGrowthRatioTTM'
  | 'priceToEarningsGrowthRatioTTM'
  | 'priceToSalesRatioTTM'
  | 'priceToBookRatioTTM'
  | 'debtToEquityRatioTTM'
  | 'netProfitMarginTTM'
  | 'grossProfitMarginTTM'
  | 'dividendYieldTTM'
  | 'dividendPayoutRatioTTM'
  | 'interestCoverageRatioTTM'
  | 'interestCoverageTTM'
  | 'currentRatioTTM'
  | 'cashRatioTTM'
  | 'evToEBITDATTM'
  | 'freeCashFlowYieldTTM'
  | 'returnOnEquityTTM'
  | 'netDebtToEBITDATTM'

export type FmpRecord = Partial<Record<FmpNumericField, number | null>> & {
  [key: string]: unknown
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

export interface ClarezaStockData extends FmpRecord {
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

export function isRecord(value: unknown): value is FmpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function firstRecord(value: unknown): FmpRecord | null {
  if (Array.isArray(value)) return value.find(isRecord) ?? null
  return isRecord(value) ? value : null
}

export function recordArray(value: unknown): FmpRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  return isRecord(value) ? [value] : []
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function fmpErrorDetails(error: unknown): { status?: number; body: string; message: string } {
  if (!axios.isAxiosError(error)) {
    return { body: '', message: errorMessage(error) }
  }

  const responseData: unknown = error.response?.data
  const body = typeof responseData === 'string'
    ? responseData.slice(0, 120)
    : JSON.stringify(responseData ?? '').slice(0, 120)
  return { status: error.response?.status, body, message: error.message }
}

// Limita concorrÃªncia sem depender de p-queue (ESM-only)
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

export const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_CACHE_KEY = 'clareza:stock-data'
export const CACHE_TTL = 28800 // 8 horas

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fmpGet(path: string, params: Record<string, string> = {}): Promise<FmpRecord | null> {
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_BASE}${path}`, {
      params: { apikey: getFmpApiKey(), ...params },
      timeout: 15000
    })
    return firstRecord(data)
  } catch {
    return null
  }
}

export function safe(val: unknown, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FETCH POR AÃ‡ÃƒO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchStock(ticker: string, isReit: boolean) {
  // Os sleeps manuais entre chamadas foram removidos: o fmpThrottle jÃ¡ Ã© o
  // Ãºnico gate de ritmo partilhado por toda a Clareza (2.400/min, plano
  // Ultimate) â€” duplicar o limite aqui sÃ³ tornava o refresh mais lento sem
  // proteger nada a mais.
  const p = await fmpGet('/profile', { symbol: ticker })
  const r = await fmpGet('/ratios-ttm', { symbol: ticker })
  const m = await fmpGet('/key-metrics-ttm', { symbol: ticker })

  const price  = p?.price            ?? null
  const change = p?.changePercentage ?? null

  let perf12m: number | null = null
  if (p?.range && price) {
    const low52 = parseFloat(String(p.range).split('-')[0])
    if (low52 > 0) perf12m = Math.round(((price - low52) / low52) * 10000) / 100
  }

  let pFfo: number | null = null
  let ffoYield: number | null = null
  let ffoPayoutRatio: number | null = null

  if (isReit) {
    const is = await fmpGet('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })
    const cf = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

    const netIncome = is?.netIncome ?? null
    const da        = is?.depreciationAndAmortization ?? cf?.depreciationAndAmortization ?? null
    const shares    = is?.weightedAverageShsOut ?? null
    const divsPaid  = cf?.netDividendsPaid != null ? Math.abs(cf.netDividendsPaid) : null

    if (netIncome !== null && da !== null) {
      const ffo = netIncome + da
      if (shares && shares > 0 && price) {
        const ffoPs = ffo / shares
        if (ffoPs > 0) {
          pFfo     = Math.round((price / ffoPs) * 100) / 100
          ffoYield = Math.round((ffoPs / price) * 10000) / 100
        }
      }
      if (divsPaid !== null && ffo > 0) {
        ffoPayoutRatio = Math.round((divsPaid / ffo) * 10000) / 100
      }
    }
  }

  return {
    price,
    change,
    perf12m,
    pe:             r?.priceToEarningsRatioTTM                                         ?? null,
    peg:            r?.forwardPriceToEarningsGrowthRatioTTM ?? r?.priceToEarningsGrowthRatioTTM ?? null,
    ps:             r?.priceToSalesRatioTTM                                             ?? null,
    pb:             r?.priceToBookRatioTTM                                              ?? null,
    evEbitda:       m?.evToEBITDATTM                                                   ?? null,
    fcfYield:       safe(m?.freeCashFlowYieldTTM,   100),
    roe:            safe(m?.returnOnEquityTTM,       100),
    netMargin:      safe(r?.netProfitMarginTTM,      100),
    grossMarginTTM: safe(r?.grossProfitMarginTTM,    100),
    dividendYield:  safe(r?.dividendYieldTTM,        100),
    payoutRatio:    safe(r?.dividendPayoutRatioTTM,  100),
    debtEquity:     r?.debtToEquityRatioTTM                                            ?? null,
    debtEbitda:     m?.netDebtToEBITDATTM                                              ?? null,
    revenueGrowth:  null,
    perf3m:         null,
    pFfo,
    ffoYield,
    ffoPayoutRatio,
    updated: new Date().toISOString(),
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null
  }
}
// Variante de fmpGet que devolve o array completo (nÃ£o sÃ³ o [0]).
export async function fmpGetArray(path: string, params: Record<string, string> = {}): Promise<FmpRecord[]> {
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_BASE}${path}`, {
      params: { apikey: getFmpApiKey(), ...params },
      timeout: 15000
    })
    return recordArray(data)
  } catch {
    return []
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100
export const num = (v: unknown): number | null =>
  v === null || v === undefined || isNaN(Number(v)) ? null : round2(Number(v))

export const REIT_CACHE_PREFIX = 'clareza:reit:'
export const STOCK_CACHE_PREFIX = 'clareza:stock:v2:'
export const REIT_VALUATION_CACHE_PREFIX = 'clareza:reitval:'
export const REIT_CACHE_TTL = 86400 // 24 horas

// Mapeia uma entrada da cache do cron clareza para o formato da anÃ¡lise REIT.
// Evita chamadas FMP para os tickers que o cron jÃ¡ atualiza 3Ã—/dia.
export function mapClarezaToReit(entry: ClarezaStockEntry) {
  const d = entry?.data ?? {}
  return {
    ticker:    entry.ticker,
    name:      entry.name ?? entry.ticker,
    sector:    entry.sector ?? null,
    industry:  null,
    price:     d.price ?? null,
    change:    d.change ?? null,
    marketCap: null,
    currency:  'USD',
    metrics: {
      pFfo:             d.pFfo ?? null,
      ffoYield:         d.ffoYield ?? null,
      ffoPerShare:      null,            // nÃ£o calculado no cron â†’ link
      ffoCagr5y:        null,            // nÃ£o calculado no cron â†’ link
      ffoPayout:        d.ffoPayoutRatio ?? null,
      netDebtToEbitda:  d.debtEbitda ?? null,
      evToEbitda:       d.evEbitda ?? null,
      dividendYield:    d.dividendYield ?? null,
      payoutRatio:      d.payoutRatio ?? null,
      interestCoverage: null,            // nÃ£o calculado no cron â†’ link
    },
    source:  'clareza-cache',
    updated: d.updated ?? new Date().toISOString()
  }
}

export function div(a: number | null, b: number | null): number | null {
  return a !== null && b !== null && b !== 0 ? a / b : null
}

export function roundedRatio(a: number | null, b: number | null, multiplier = 1): number | null {
  const ratio = div(a, b)
  return ratio === null ? null : round2(ratio * multiplier)
}

export function metricNum(v: unknown): number | null {
  return v === null || v === undefined || isNaN(Number(v)) ? null : Number(v)
}

export function roundOrNull(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : round2(v)
}

export function yearOf(row: FmpRecord | null | undefined): string | null {
  return String(row?.calendarYear ?? row?.year ?? row?.date ?? '').slice(0, 4) || null
}

export function average(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

export function calcCagr(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0)
  if (valid.length < 2) return null
  const newest = valid[0]
  const oldest = valid[valid.length - 1]
  return Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1
}

export function buildFfoRow(income: FmpRecord | null | undefined, cashFlow?: FmpRecord | null) {
  const shares = metricNum(income?.weightedAverageShsOutDil ?? income?.weightedAverageShsOut)
  const netIncome = metricNum(income?.netIncome)
  const depreciation = metricNum(
    income?.depreciationAndAmortization ?? cashFlow?.depreciationAndAmortization
  )
  const capex = metricNum(cashFlow?.capitalExpenditure)
  const ffo = netIncome !== null && depreciation !== null ? netIncome + depreciation : null
  const ffoPerShare = div(ffo, shares)
  const capexPerShare = div(capex, shares)
  const affo = ffo !== null && capex !== null ? ffo - Math.abs(capex) : null
  const affoPerShare = div(affo, shares)

  return { shares, ffo, ffoPerShare, capex, capexPerShare, affoPerShare }
}

export function cashFlowByYear(cashFlows: FmpRecord[]) {
  const byYear = new Map<string, FmpRecord>()
  for (const row of cashFlows) {
    const year = yearOf(row)
    if (year) byYear.set(year, row)
  }
  return byYear
}

export function aggregateDividends(rows: FmpRecord[]) {
  const byYear = new Map<string, number>()
  for (const row of rows) {
    const year = yearOf(row)
    const dividend = metricNum(row?.adjDividend ?? row?.dividend)
    if (!year || dividend === null) continue
    byYear.set(year, (byYear.get(year) ?? 0) + dividend)
  }

  return Array.from(byYear.entries())
    .map(([year, annual]) => ({ year, annual: round2(annual) }))
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 6)
}

export function mapClarezaToStock(entry: ClarezaStockEntry) {
  const d = entry?.data ?? {}
  return {
    ticker:    entry.ticker,
    name:      entry.name ?? entry.ticker,
    sector:    entry.sector ?? null,
    industry:  null,
    price:     d.price ?? null,
    change:    d.change ?? null,
    beta:      null,
    marketCap: null,
    currency:  'USD',
    metrics: {
      eps:              null,
      pe:               d.pe ?? null,
      vpa:              null,
      pVpa:             d.pb ?? null,
      cagrEps:          null,
      peg:              d.peg ?? null,
      grossMargin:      d.grossMarginTTM ?? null,
      ebitdaMargin:     null,
      netMargin:        d.netMargin ?? null,
      roe:              d.roe ?? null,
      netDebtToEbitda:  d.debtEbitda ?? null,
      currentRatio:     null,
      cashRatio:        null,
      dividendYield:    d.dividendYield ?? null,
      payoutRatio:      d.payoutRatio ?? null,
    },
    source:  'clareza-cache',
    updated: d.updated ?? new Date().toISOString()
  }
}
