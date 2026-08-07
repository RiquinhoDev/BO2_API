import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import ClarezaCarteiraData, {
  IClarezaCarteiraItem,
  IClarezaCarteiraMetrics
} from '../../models/ClarezaCarteiraData'

import { UNIVERSE, type CarteiraItem, type CarteiraKind } from './carteira/carteiraUniverse'

type NumericFmpValue = number | null | undefined

interface FmpProfile {
  price?: NumericFmpValue
  changePercentage?: NumericFmpValue
  range?: string | null
  currency?: string | null
  exchangeShortName?: string | null
  exchange?: string | null
}

interface FmpRatios {
  priceToEarningsRatioTTM?: NumericFmpValue
  forwardPriceToEarningsGrowthRatioTTM?: NumericFmpValue
  priceToEarningsGrowthRatioTTM?: NumericFmpValue
  priceToSalesRatioTTM?: NumericFmpValue
  priceToBookRatioTTM?: NumericFmpValue
  netProfitMarginTTM?: NumericFmpValue
  grossProfitMarginTTM?: NumericFmpValue
  dividendYieldTTM?: NumericFmpValue
  dividendPayoutRatioTTM?: NumericFmpValue
  debtToEquityRatioTTM?: NumericFmpValue
}

interface FmpKeyMetrics {
  evToEBITDATTM?: NumericFmpValue
  freeCashFlowYieldTTM?: NumericFmpValue
  returnOnEquityTTM?: NumericFmpValue
  netDebtToEBITDATTM?: NumericFmpValue
}

interface FmpIncomeStatement {
  netIncome?: NumericFmpValue
  depreciationAndAmortization?: NumericFmpValue
  weightedAverageShsOut?: NumericFmpValue
}

interface FmpCashFlowStatement {
  depreciationAndAmortization?: NumericFmpValue
  netDividendsPaid?: NumericFmpValue
}

interface FmpQuote {
  price?: NumericFmpValue
  changePercentage?: NumericFmpValue
  yearLow?: NumericFmpValue
}

interface CarteiraSearchResult {
  ticker: string
  name: string
  type: string | null
  kind: CarteiraKind | null
  currency: string | null
}

interface CarteiraSearchResponse {
  query: string
  count: number
  results: CarteiraSearchResult[]
}

interface RankedCarteiraResult {
  rank: number
  result: CarteiraSearchResult
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Limits concurrency without adding p-queue to this hot path.
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_CARTEIRA_CACHE_KEY = 'clareza:carteira-data'
export const CLAREZA_CARTEIRA_CACHE_TTL = 28800 // 8 hours

function hasFmpError(data: object): boolean {
  return 'Error Message' in data
}

async function fmpGet<T extends object>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    await fmpThrottle()
    const { data } = await axios.get<T | T[]>(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    if (!data || (!Array.isArray(data) && hasFmpError(data))) return null
    if (Array.isArray(data)) return data[0] ?? null
    return data
  } catch {
    return null
  }
}

function safe(val: unknown, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

function round2(val: number): number {
  return Math.round(val * 100) / 100
}

function normalizeForFmp(rawTicker: string): string {
  const ticker = normalizeTicker(rawTicker)
  // tickerUtils is intentionally strict for user-facing stock endpoints. The
  // curated fund universe includes longer exchange symbols, so allow those here.
  if (!isValidTicker(ticker) && !/^[A-Z0-9][A-Z0-9.\-]{0,24}$/.test(ticker)) {
    throw new Error('Ticker invalido')
  }
  return ticker
}

function perfFromRange(range: unknown, price: unknown): number | null {
  if (!range || !price) return null
  const low52 = parseFloat(String(range).split('-')[0])
  return low52 > 0 ? round2(((Number(price) - low52) / low52) * 100) : null
}

export async function fetchStock(rawTicker: string, isReit: boolean): Promise<IClarezaCarteiraMetrics> {
  const ticker = normalizeForFmp(rawTicker)
  const p = await fmpGet<FmpProfile>('/profile', { symbol: ticker })
  const r = await fmpGet<FmpRatios>('/ratios-ttm', { symbol: ticker })
  const m = await fmpGet<FmpKeyMetrics>('/key-metrics-ttm', { symbol: ticker })

  const price = p?.price ?? null
  const change = p?.changePercentage ?? null
  const perf12m = perfFromRange(p?.range, price)

  let pFfo: number | null = null
  let ffoYield: number | null = null
  let ffoPayoutRatio: number | null = null

  if (isReit) {
    const income = await fmpGet<FmpIncomeStatement>('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })
    const cashFlow = await fmpGet<FmpCashFlowStatement>('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

    const netIncome = income?.netIncome ?? null
    const da = income?.depreciationAndAmortization ?? cashFlow?.depreciationAndAmortization ?? null
    const shares = income?.weightedAverageShsOut ?? null
    const divsPaid = cashFlow?.netDividendsPaid != null ? Math.abs(cashFlow.netDividendsPaid) : null

    if (netIncome !== null && da !== null) {
      const ffo = netIncome + da
      if (shares && shares > 0 && price) {
        const ffoPs = ffo / shares
        if (ffoPs > 0) {
          pFfo = round2(price / ffoPs)
          ffoYield = round2((ffoPs / price) * 100)
        }
      }
      if (divsPaid !== null && ffo > 0) {
        ffoPayoutRatio = round2((divsPaid / ffo) * 100)
      }
    }
  }

  return {
    price,
    change,
    perf12m,
    pe: r?.priceToEarningsRatioTTM ?? null,
    peg: r?.forwardPriceToEarningsGrowthRatioTTM ?? r?.priceToEarningsGrowthRatioTTM ?? null,
    ps: r?.priceToSalesRatioTTM ?? null,
    pb: r?.priceToBookRatioTTM ?? null,
    evEbitda: m?.evToEBITDATTM ?? null,
    fcfYield: safe(m?.freeCashFlowYieldTTM, 100),
    roe: safe(m?.returnOnEquityTTM, 100),
    netMargin: safe(r?.netProfitMarginTTM, 100),
    grossMarginTTM: safe(r?.grossProfitMarginTTM, 100),
    dividendYield: safe(r?.dividendYieldTTM, 100),
    payoutRatio: safe(r?.dividendPayoutRatioTTM, 100),
    debtEquity: r?.debtToEquityRatioTTM ?? null,
    debtEbitda: m?.netDebtToEBITDATTM ?? null,
    revenueGrowth: null,
    perf3m: null,
    pFfo,
    ffoYield,
    ffoPayoutRatio,
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null,
    updated: new Date().toISOString()
  }
}

export async function fetchEtf(rawTicker: string): Promise<IClarezaCarteiraMetrics> {
  const ticker = normalizeForFmp(rawTicker)
  const p = await fmpGet<FmpProfile>('/profile', { symbol: ticker })
  const r = await fmpGet<FmpRatios>('/ratios-ttm', { symbol: ticker })
  const price = p?.price ?? null

  return {
    price,
    change: p?.changePercentage ?? null,
    perf12m: perfFromRange(p?.range, price),
    dividendYield: safe(r?.dividendYieldTTM, 100),
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null,
    updated: new Date().toISOString()
  }
}

export async function fetchCrypto(rawTicker: string): Promise<IClarezaCarteiraMetrics> {
  const ticker = normalizeForFmp(rawTicker)
  const q = await fmpGet<FmpQuote>('/quote', { symbol: ticker })
  const price = q?.price ?? null
  let perf12m: number | null = null
  if (q?.yearLow && price) {
    const low = Number(q.yearLow)
    if (low > 0) perf12m = round2(((price - low) / low) * 100)
  }

  return {
    price,
    change: q?.changePercentage ?? null,
    perf12m,
    dividendYield: null,
    currency: 'USD',
    exchange: 'Cripto',
    updated: new Date().toISOString()
  }
}

export async function fetchItem(item: CarteiraItem): Promise<IClarezaCarteiraMetrics> {
  if (item.kind === 'crypto') return fetchCrypto(item.ticker)
  if (item.kind === 'fund') return fetchEtf(item.ticker)
  return fetchStock(item.ticker, item.type === 'reit')
}

export async function refreshClarezaCarteiraData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`[ClarezaCarteira] Iniciando refresh de ${UNIVERSE.length} ativos...`)
  let errors = 0

  const results = await runWithConcurrency(
    UNIVERSE.map(item => async () => {
      try {
        const data = await fetchItem(item)
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type,
          kind: item.kind,
          sector: item.sector,
          data
        }
      } catch (err: unknown) {
        errors++
        console.error(`[ClarezaCarteira] Erro em ${item.ticker}:`, errorMessage(err))
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type,
          kind: item.kind,
          sector: item.sector,
          data: null
        }
      }
    }),
    12
  )

  await cacheService.set(CLAREZA_CARTEIRA_CACHE_KEY, results, CLAREZA_CARTEIRA_CACHE_TTL)

  try {
    await ClarezaCarteiraData.create({
      fetchedAt: new Date(),
      itemCount: UNIVERSE.length - errors,
      errors,
      items: results
    })
    const all = await ClarezaCarteiraData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map((document) => document._id)
      await ClarezaCarteiraData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log('[ClarezaCarteira] Snapshot guardado na BD')
  } catch (err: unknown) {
    console.error('[ClarezaCarteira] Erro ao guardar snapshot na BD:', errorMessage(err))
  }

  console.log(`[ClarezaCarteira] Refresh completo - ${UNIVERSE.length - errors} ok, ${errors} erros`)
  return { total: UNIVERSE.length, errors }
}

export async function getClarezaCarteiraData(): Promise<IClarezaCarteiraItem[] | null> {
  const cached = await cacheService.get<IClarezaCarteiraItem[]>(CLAREZA_CARTEIRA_CACHE_KEY)
  if (cached) return cached

  try {
    const latest = await ClarezaCarteiraData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.items?.length) {
      console.log(`[ClarezaCarteira] Cache Redis vazio - a servir snapshot da BD (${latest.fetchedAt})`)
      await cacheService.set(CLAREZA_CARTEIRA_CACHE_KEY, latest.items, CLAREZA_CARTEIRA_CACHE_TTL)
      return latest.items
    }
  } catch (err: unknown) {
    console.error('[ClarezaCarteira] Erro ao ler snapshot da BD:', errorMessage(err))
  }

  console.warn('[ClarezaCarteira] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}

export async function searchCarteira(rawQuery: string): Promise<CarteiraSearchResponse> {
  const q = String(rawQuery || '').trim().toUpperCase()
  const cache = await getClarezaCarteiraData()
  const ranked = (cache ?? [])
    .map((item): RankedCarteiraResult | null => {
      const ticker = String(item.ticker ?? '')
      const name = String(item.name ?? '')
      const tickerUp = ticker.toUpperCase()
      const nameUp = name.toUpperCase()
      let rank: number | null = null

      if (q === '') rank = 3
      else if (tickerUp === q) rank = 0
      else if (tickerUp.startsWith(q)) rank = 1
      else if (nameUp.startsWith(q)) rank = 2
      else if (tickerUp.includes(q) || nameUp.includes(q)) rank = 3

      if (rank === null) return null
      return {
        rank,
        result: {
          ticker,
          name,
          type: item.type ?? null,
          kind: item.kind ?? null,
          currency: item.data?.currency ?? null
        }
      }
    })
    .filter((entry): entry is RankedCarteiraResult => entry !== null)
    .sort((a, b) => a.rank - b.rank || a.result.ticker.localeCompare(b.result.ticker))
    .map((entry) => entry.result)

  return { query: q, count: ranked.length, results: ranked.slice(0, 25) }
}
