import type { IClarezaCarteiraMetrics } from '../../../models/ClarezaCarteiraData'
import { normalizeTicker, isValidTicker } from '../tickerUtils'
import type { CarteiraItem } from './carteiraUniverse'
import type { FmpCarteiraClient } from './fmpCarteiraClient'

export interface Clock {
  now(): Date
}

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

export function hasCoreMetricsData(metrics: IClarezaCarteiraMetrics): boolean {
  return Object.entries(metrics).some(([key, value]) => (
    key !== 'updated'
    && value !== null
    && value !== undefined
    && value !== ''
  ))
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
  if (!isValidTicker(ticker) && !/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(ticker)) {
    throw new Error('Ticker invalido')
  }
  return ticker
}

function perfFromRange(range: unknown, price: unknown): number | null {
  if (!range || !price) return null
  const low52 = parseFloat(String(range).split('-')[0])
  return low52 > 0 ? round2(((Number(price) - low52) / low52) * 100) : null
}

export class CarteiraMetricsFetcher {
  constructor(
    private readonly client: FmpCarteiraClient,
    private readonly clock: Clock,
  ) {}

  fetchItem(item: CarteiraItem): Promise<IClarezaCarteiraMetrics> {
    if (item.kind === 'crypto') return this.fetchCrypto(item.ticker)
    if (item.kind === 'fund') return this.fetchEtf(item.ticker)
    return this.fetchStock(item.ticker, item.type === 'reit')
  }

  async fetchStock(rawTicker: string, isReit: boolean): Promise<IClarezaCarteiraMetrics> {
    const ticker = normalizeForFmp(rawTicker)
    const p = await this.client.fetch<FmpProfile>('/profile', { symbol: ticker })
    const r = await this.client.fetch<FmpRatios>('/ratios-ttm', { symbol: ticker })
    const m = await this.client.fetch<FmpKeyMetrics>('/key-metrics-ttm', { symbol: ticker })

    const price = p?.price ?? null
    const change = p?.changePercentage ?? null
    const perf12m = perfFromRange(p?.range, price)

    let pFfo: number | null = null
    let ffoYield: number | null = null
    let ffoPayoutRatio: number | null = null

    if (isReit) {
      const income = await this.client.fetch<FmpIncomeStatement>('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })
      const cashFlow = await this.client.fetch<FmpCashFlowStatement>('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

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
      updated: this.clock.now().toISOString(),
    }
  }

  async fetchEtf(rawTicker: string): Promise<IClarezaCarteiraMetrics> {
    const ticker = normalizeForFmp(rawTicker)
    const p = await this.client.fetch<FmpProfile>('/profile', { symbol: ticker })
    const r = await this.client.fetch<FmpRatios>('/ratios-ttm', { symbol: ticker })
    const price = p?.price ?? null

    return {
      price,
      change: p?.changePercentage ?? null,
      perf12m: perfFromRange(p?.range, price),
      dividendYield: safe(r?.dividendYieldTTM, 100),
      currency: p?.currency ?? null,
      exchange: p?.exchangeShortName ?? p?.exchange ?? null,
      updated: this.clock.now().toISOString(),
    }
  }

  async fetchCrypto(rawTicker: string): Promise<IClarezaCarteiraMetrics> {
    const ticker = normalizeForFmp(rawTicker)
    const q = await this.client.fetch<FmpQuote>('/quote', { symbol: ticker })
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
      updated: this.clock.now().toISOString(),
    }
  }
}
