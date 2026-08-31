import type { ComparadorStock } from './comparador.types'
import { executeFmpRequest } from '../fmpRequestPolicy'
import {
  FmpInFlightDeduplicator,
  type FmpRequestDeduplicator,
} from '../fmpRequestDeduplicator'

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const FMP_TIMEOUT_MS = 15000

type JsonObject = Readonly<Record<string, unknown>>

export interface ComparadorFmpPort {
  fetchCompany(ticker: string, signal?: AbortSignal): Promise<ComparadorStock | null>
}

export interface ComparadorFmpHttpPort {
  get(
    url: string,
    options: {
      readonly params: Readonly<Record<string, string>>
      readonly timeout: number
      readonly signal?: AbortSignal
    },
  ): Promise<{ readonly data: unknown }>
}

export interface ComparadorFmpClientDependencies {
  readonly http: ComparadorFmpHttpPort
  readonly getApiKey: () => string | undefined
  readonly throttle: (signal?: AbortSignal) => Promise<void>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly now: () => string
  readonly deduplicator?: FmpRequestDeduplicator
}

function requestIdentity(
  path: string,
  ticker: string,
  params: Readonly<Record<string, string>>,
): string {
  const sortedParams = Object.entries(params).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([path, ticker, sortedParams])
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstObject(value: unknown): JsonObject | null {
  const first = Array.isArray(value) ? value[0] : value
  if (!isJsonObject(first) || 'Error Message' in first) return null
  return first
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

function metricPercent(value: unknown): number | null {
  const numeric = nullableNumber(value)
  return numeric === null ? null : round(numeric * 100, 4)
}

function profileIsReit(profile: JsonObject): boolean {
  const sector = nullableString(profile.sector)?.toLowerCase() ?? ''
  const industry = nullableString(profile.industry)?.toLowerCase() ?? ''
  return sector.includes('real estate') || industry.includes('reit')
}

function perf12m(profile: JsonObject, price: number | null): number | null {
  const range = nullableString(profile.range)
  if (!range || !price) return null
  const [lowRaw] = range.split('-')
  const low = nullableNumber(lowRaw?.trim())
  if (low === null || low <= 0) return null
  return round(((price - low) / low) * 100, 2)
}

function calculateFfo(
  price: number | null,
  income: JsonObject,
  cashFlow: JsonObject,
): { readonly pFfo: number | null; readonly ffoPayout: number | null } {
  const netIncome = nullableNumber(income.netIncome)
  const depreciation = nullableNumber(income.depreciationAndAmortization)
    ?? nullableNumber(cashFlow.depreciationAndAmortization)
  const shares = nullableNumber(income.weightedAverageShsOut)
  const dividendsPaid = nullableNumber(cashFlow.netDividendsPaid)

  if (netIncome === null || depreciation === null) return { pFfo: null, ffoPayout: null }
  const ffo = netIncome + depreciation
  const pFfo = price !== null && price !== 0 && shares !== null && shares > 0 && ffo / shares > 0
    ? round(price / (ffo / shares), 2)
    : null
  const ffoPayout = dividendsPaid !== null && ffo > 0
    ? round((Math.abs(dividendsPaid) / ffo) * 100, 2)
    : null
  return { pFfo, ffoPayout }
}

export class AxiosComparadorFmpClient implements ComparadorFmpPort {
  private readonly deduplicator: FmpRequestDeduplicator

  constructor(private readonly dependencies: ComparadorFmpClientDependencies) {
    this.deduplicator = dependencies.deduplicator ?? new FmpInFlightDeduplicator()
  }

  async fetchCompany(ticker: string, signal?: AbortSignal): Promise<ComparadorStock | null> {
    const apiKey = this.getApiKey()
    if (!apiKey) return null

    let profile = await this.fetchObject('/profile', ticker, apiKey, {}, signal)
    if (!profile) profile = await this.fetchObject('/quote', ticker, apiKey, {}, signal)
    if (!profile) return null

    const ratios = (await this.fetchObject('/ratios-ttm', ticker, apiKey, {}, signal)) ?? {}
    const keyMetrics = (await this.fetchObject('/key-metrics-ttm', ticker, apiKey, {}, signal)) ?? {}
    const grades = (await this.fetchObject('/grades-consensus', ticker, apiKey, {}, signal)) ?? {}
    const priceTarget = (await this.fetchObject('/price-target-consensus', ticker, apiKey, {}, signal)) ?? {}
    const price = nullableNumber(profile.price)
    const isReit = profileIsReit(profile)
    const ffo = isReit
      ? calculateFfo(
        price,
        (await this.fetchObject('/income-statement', ticker, apiKey, { period: 'annual', limit: '1' }, signal)) ?? {},
        (await this.fetchObject('/cash-flow-statement', ticker, apiKey, { period: 'annual', limit: '1' }, signal)) ?? {},
      )
      : { pFfo: null, ffoPayout: null }
    const targetConsensus = nullableNumber(priceTarget.targetConsensus)
    const upside = targetConsensus !== null && targetConsensus !== 0 && price !== null && price !== 0
      ? round(((targetConsensus - price) / price) * 100, 1)
      : null

    return {
      ticker,
      name: stringOr(profile.companyName, stringOr(profile.name, ticker)),
      image: nullableString(profile.image),
      sector: nullableString(profile.sector),
      industry: nullableString(profile.industry),
      country: nullableString(profile.country),
      currency: stringOr(profile.currency, 'USD'),
      exchange: nullableString(profile.exchangeShortName) ?? nullableString(profile.exchange),
      isReit,
      price,
      change: nullableNumber(profile.changePercentage),
      perf12m: perf12m(profile, price),
      marketCap: nullableNumber(profile.marketCap) ?? nullableNumber(keyMetrics.marketCap),
      beta: nullableNumber(profile.beta),
      pe: nullableNumber(ratios.priceToEarningsRatioTTM),
      peg: nullableNumber(ratios.forwardPriceToEarningsGrowthRatioTTM)
        ?? nullableNumber(ratios.priceToEarningsGrowthRatioTTM),
      ps: nullableNumber(ratios.priceToSalesRatioTTM),
      pb: nullableNumber(ratios.priceToBookRatioTTM),
      evEbitda: nullableNumber(keyMetrics.evToEBITDATTM),
      pFfo: ffo.pFfo,
      grossMargin: metricPercent(ratios.grossProfitMarginTTM),
      netMargin: metricPercent(ratios.netProfitMarginTTM),
      roe: metricPercent(keyMetrics.returnOnEquityTTM),
      roic: metricPercent(keyMetrics.returnOnInvestedCapitalTTM ?? keyMetrics.roicTTM),
      fcfYield: metricPercent(keyMetrics.freeCashFlowYieldTTM),
      debtEquity: nullableNumber(ratios.debtToEquityRatioTTM),
      debtEbitda: nullableNumber(keyMetrics.netDebtToEBITDATTM),
      dividendYield: metricPercent(ratios.dividendYieldTTM),
      payoutRatio: metricPercent(ratios.dividendPayoutRatioTTM),
      ffoPayout: ffo.ffoPayout,
      analystConsensus: nullableString(grades.consensus),
      strongBuy: nullableNumber(grades.strongBuy),
      buy: nullableNumber(grades.buy),
      hold: nullableNumber(grades.hold),
      sell: nullableNumber(grades.sell),
      strongSell: nullableNumber(grades.strongSell),
      targetConsensus,
      upside,
      updated: this.dependencies.now(),
    }
  }

  private getApiKey(): string | undefined {
    try {
      return this.dependencies.getApiKey()
    } catch {
      return undefined
    }
  }

  private async fetchObject(
    path: string,
    ticker: string,
    apiKey: string,
    params: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<JsonObject | null> {
    try {
      const request = () => executeFmpRequest({
        request: () => this.dependencies.http.get(`${FMP_BASE_URL}${path}`, {
          params: { apikey: apiKey, symbol: ticker, ...params },
          timeout: FMP_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        }),
        throttle: this.dependencies.throttle,
        sleep: this.dependencies.sleep,
        signal,
      })
      const response = signal
        ? await request()
        : await this.deduplicator.run(requestIdentity(path, ticker, params), request)
      return firstObject(response.data)
    } catch {
      return null
    }
  }
}
