import type { CoreClock as Clock, CoreMarketMetrics } from './coreMarketMetrics'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreMasterFmpPort {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

const record = (value: unknown): JsonRecord | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null
)
const first = (value: unknown): JsonRecord | null => record(Array.isArray(value) ? value[0] : value)
const rows = (value: unknown): readonly JsonRecord[] => (
  Array.isArray(value)
    ? value.map(item => record(item)).filter((item): item is JsonRecord => item !== null)
    : []
)
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null
}
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
const percentValue = (value: unknown): number | null => {
  const parsed = num(value)
  return parsed === null ? null : round(parsed * 100, 4)
}
const positiveMedian = (values: readonly unknown[]): number | null => {
  const finite = values.flatMap(value => {
    const parsed = num(value)
    return parsed !== null && parsed > 0 ? [parsed] : []
  }).sort((left, right) => left - right)
  if (!finite.length) return null
  const middle = Math.floor(finite.length / 2)
  return round(finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2, 4)
}
const cagr = (oldest: unknown, newest: unknown, years: number): number | null => {
  const start = num(oldest)
  const end = num(newest)
  return start !== null && end !== null && start > 0 && end > 0 && years > 0
    ? round(((end / start) ** (1 / years) - 1) * 100, 2)
    : null
}

function marginStability(ratios: readonly JsonRecord[]): number | null {
  const margins = ratios.flatMap(row => {
    const value = num(row.netProfitMargin)
    return value === null ? [] : [value * 100]
  })
  if (margins.length < 3) return null
  const mean = margins.reduce((total, value) => total + value, 0) / margins.length
  if (Math.abs(mean) <= 0.5) return null
  const variance = margins.reduce((total, value) => total + (value - mean) ** 2, 0) / margins.length
  const stability = round(Math.max(0, Math.min(100, 100 - (Math.sqrt(variance) / Math.abs(mean)) * 130)), 1)
  return mean < 0 ? Math.min(stability, 20) : stability
}

export class CoreMasterMetricsFetcher {
  constructor(
    private readonly fmp: CoreMasterFmpPort,
    private readonly clock: Clock,
  ) {}

  fetchItem(asset: ClarezaAsset): Promise<CoreMarketMetrics> {
    if (asset.kind === 'crypto') return this.fetchCrypto(asset.ticker)
    if (asset.kind === 'fund') return this.fetchFund(asset.ticker)
    return this.fetchStock(asset.ticker, asset.type === 'reit')
  }

  private async get(path: string, ticker: string, params: Readonly<Record<string, string>> = {}): Promise<unknown> {
    return this.fmp.get(path, { symbol: ticker, ...params })
  }

  private async fetchStock(ticker: string, isReit: boolean): Promise<CoreMarketMetrics> {
    const profile = first(await this.get('/profile', ticker)) ?? {}
    const ratios = first(await this.get('/ratios-ttm', ticker)) ?? {}
    const keyMetrics = first(await this.get('/key-metrics-ttm', ticker)) ?? {}
    const changes = first(await this.get('/stock-price-change', ticker)) ?? {}
    const historicalRatios = rows(await this.get('/ratios', ticker, { period: 'annual', limit: '6' }))
    const historicalKeyMetrics = rows(await this.get('/key-metrics', ticker, { period: 'annual', limit: '6' }))
    const income = rows(await this.get('/income-statement', ticker, { period: 'annual', limit: '5' }))
    const dcfRow = first(await this.get('/levered-discounted-cash-flow', ticker)) ?? {}
    const cashFlow = first(await this.get('/cash-flow-statement', ticker, { period: 'annual', limit: '1' })) ?? {}

    const newest = income[0] ?? {}
    const prior = income[1] ?? {}
    const oldest = income[income.length - 1] ?? {}
    const years = income.length >= 2 ? income.length - 1 : 0
    const revenueNewest = num(newest.revenue)
    const revenuePrior = num(prior.revenue)
    const epsNewest = num(newest.eps)
    const epsPrior = num(prior.eps)
    const revenueYoY = revenueNewest !== null && revenuePrior !== null && revenuePrior > 0
      ? round((revenueNewest / revenuePrior - 1) * 100, 2) : null
    const epsYoY = epsNewest !== null && epsPrior !== null && epsPrior > 0
      ? round((epsNewest / epsPrior - 1) * 100, 2) : null
    const epsTurnaround = epsNewest !== null && epsPrior !== null && epsPrior <= 0 && epsNewest > 0
    const latestNetIncome = num(newest.netIncome)
    const latestFreeCashFlow = num(cashFlow.freeCashFlow)
    const fcfConversion = latestNetIncome !== null && latestNetIncome > 0 && latestFreeCashFlow !== null
      ? round((latestFreeCashFlow / latestNetIncome) * 100, 1) : null
    let interestCoverage = num(ratios.interestCoverageRatioTTM ?? ratios.interestCoverageTTM)
    if (interestCoverage !== null && Math.abs(interestCoverage) < 0.01) {
      const expense = num(newest.interestExpense)
      if (expense === null || Math.abs(expense) < 1000) interestCoverage = null
    }
    const price = num(profile.price)
    let pFfo: number | null = null
    let ffoYield: number | null = null
    let ffoPayoutRatio: number | null = null
    if (isReit) {
      const netIncome = num(newest.netIncome)
      const depreciation = num(newest.depreciationAndAmortization ?? cashFlow.depreciationAndAmortization)
      const shares = num(newest.weightedAverageShsOut)
      const dividends = num(cashFlow.netDividendsPaid)
      if (netIncome !== null && depreciation !== null) {
        const ffo = netIncome + depreciation
        if (shares !== null && shares > 0 && price !== null && price > 0) {
          const perShare = ffo / shares
          if (perShare > 0) {
            pFfo = round(price / perShare)
            ffoYield = round((perShare / price) * 100)
          }
        }
        if (dividends !== null && ffo > 0) ffoPayoutRatio = round((Math.abs(dividends) / ffo) * 100)
      }
    }
    const historicalPe = positiveMedian(historicalRatios.map(row => row.priceToEarningsRatio ?? row.priceEarningsRatio))
    return {
      price,
      change: num(profile.changePercentage),
      perf12m: num(changes['1Y']),
      chgDay: num(changes['1D'] ?? profile.changePercentage),
      chgWeek: num(changes['5D']),
      chgMonth: num(changes['1M']),
      perf3m: num(changes['3M']),
      marketCap: num(profile.marketCap),
      beta: num(profile.beta),
      range: typeof profile.range === 'string' ? profile.range : null,
      country: typeof profile.country === 'string' ? profile.country : null,
      industry: typeof profile.industry === 'string' ? profile.industry : null,
      pe: num(ratios.priceToEarningsRatioTTM),
      peg: num(ratios.forwardPriceToEarningsGrowthRatioTTM ?? ratios.priceToEarningsGrowthRatioTTM),
      ps: num(ratios.priceToSalesRatioTTM),
      pb: num(ratios.priceToBookRatioTTM),
      evEbitda: num(keyMetrics.evToEBITDATTM),
      fcfYield: percentValue(keyMetrics.freeCashFlowYieldTTM),
      roe: percentValue(keyMetrics.returnOnEquityTTM),
      roic: percentValue(keyMetrics.returnOnInvestedCapitalTTM),
      netMargin: percentValue(ratios.netProfitMarginTTM),
      grossMarginTTM: percentValue(ratios.grossProfitMarginTTM),
      dividendYield: percentValue(ratios.dividendYieldTTM),
      payoutRatio: percentValue(ratios.dividendPayoutRatioTTM),
      debtEquity: num(ratios.debtToEquityRatioTTM),
      debtEbitda: num(keyMetrics.netDebtToEBITDATTM),
      interestCoverage,
      fcfConversion,
      revenueGrowth: cagr(oldest.revenue, newest.revenue, years),
      growthYears: years || null,
      latestFiscalYear: typeof newest.fiscalYear === 'string' || typeof newest.fiscalYear === 'number'
        ? String(newest.fiscalYear)
        : typeof newest.date === 'string' ? newest.date.slice(0, 4) : null,
      revenueYoY,
      epsYoY,
      epsTurnaround,
      pFfo,
      ffoYield,
      ffoPayoutRatio,
      histMedians: {
        pe: historicalPe,
        ps: positiveMedian(historicalRatios.map(row => row.priceToSalesRatio ?? row.priceSalesRatio)),
        pb: positiveMedian(historicalRatios.map(row => row.priceToBookRatio ?? row.priceBookValueRatio)),
        evEbitda: positiveMedian(historicalKeyMetrics.map(row => row.evToEBITDA ?? row.enterpriseValueOverEBITDA)),
        ...(isReit ? { pFfo: historicalPe } : {}),
      },
      epsCagr: cagr(oldest.eps, newest.eps, years),
      revenueCagr: cagr(oldest.revenue, newest.revenue, years),
      dcf: num(dcfRow.dcf) !== null && num(dcfRow.dcf)! > 0 ? num(dcfRow.dcf) : null,
      marginStability: marginStability(historicalRatios),
      currency: typeof profile.currency === 'string' ? profile.currency : null,
      exchange: typeof (profile.exchangeShortName ?? profile.exchange) === 'string'
        ? String(profile.exchangeShortName ?? profile.exchange) : null,
      updated: this.clock.now().toISOString(),
    }
  }

  private async fetchFund(ticker: string): Promise<CoreMarketMetrics> {
    const profile = first(await this.get('/profile', ticker)) ?? {}
    const ratios = first(await this.get('/ratios-ttm', ticker)) ?? {}
    const changes = first(await this.get('/stock-price-change', ticker)) ?? {}
    return {
      price: num(profile.price), change: num(profile.changePercentage), perf12m: num(changes['1Y']),
      perf3m: num(changes['3M']), dividendYield: percentValue(ratios.dividendYieldTTM),
      beta: num(profile.beta),
      range: typeof profile.range === 'string' ? profile.range : null,
      country: typeof profile.country === 'string' ? profile.country : null,
      currency: typeof profile.currency === 'string' ? profile.currency : null,
      exchange: typeof (profile.exchangeShortName ?? profile.exchange) === 'string'
        ? String(profile.exchangeShortName ?? profile.exchange) : null,
      updated: this.clock.now().toISOString(),
    }
  }

  private async fetchCrypto(ticker: string): Promise<CoreMarketMetrics> {
    const quote = first(await this.get('/quote', ticker)) ?? {}
    const price = num(quote.price)
    const yearLow = num(quote.yearLow)
    return {
      price, change: num(quote.changePercentage),
      perf12m: price !== null && yearLow !== null && yearLow > 0 ? round(((price - yearLow) / yearLow) * 100) : null,
      dividendYield: null, currency: 'USD', exchange: 'Cripto', updated: this.clock.now().toISOString(),
    }
  }
}
