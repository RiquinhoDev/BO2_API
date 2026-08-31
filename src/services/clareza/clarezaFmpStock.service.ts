import { cacheService } from '../cache.service'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import { getFmpApiKey } from '../requestDrivenRuntimeConfig'
import { getClarezaData } from './clarezaFmpData.service'
import { FmpRecord, REIT_CACHE_TTL, STOCK_CACHE_PREFIX, div, fmpErrorDetails, fmpGet, fmpGetArray, fmpGetOrThrow, isRecord, mapClarezaToStock, metricNum, num, round2, roundedRatio, safe, sleep } from './clarezaFmpAnalysisSupport'

export async function getStockAnalysis(rawTicker: string) {
  getFmpApiKey()

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = STOCK_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // Calcula sempre live (16 indicadores das demonstraÃ§Ãµes). A cache do cron
  // (parcial) Ã© usada apenas como fallback se a FMP falhar (ver catch abaixo).
  let profile: FmpRecord | null
  try {
    profile = await fmpGetOrThrow('/profile', { symbol: ticker })
  } catch (e: unknown) {
    const { status, body, message } = fmpErrorDetails(e)
    // Live falhou (rate limit / erro) -> fallback parcial da cache do cron.
    try {
      const universe = await getClarezaData()
      const hit = universe?.find(s => s.ticker === ticker && s.data)
      if (hit) {
        const partial = mapClarezaToStock(hit)
        await cacheService.set(cacheKey, partial, REIT_CACHE_TTL)
        return partial
      }
    } catch { /* sem cache -> propaga o erro original */ }
    throw Object.assign(new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`), { cause: e })
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '2' }); await sleep(150)
  const balance = await fmpGet('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '1' }); await sleep(150)
  const cashFlow = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' }); await sleep(150)
  const ratios = await fmpGet('/ratios-ttm', { symbol: ticker }); await sleep(150)
  const keyMetrics = await fmpGet('/key-metrics-ttm', { symbol: ticker })

  const latest = incomes[0] ?? null
  const previous = incomes[1] ?? null
  const price = metricNum(profile.price)
  const shares = metricNum(latest?.weightedAverageShsOutDil ?? latest?.weightedAverageShsOut)
  const previousShares = metricNum(previous?.weightedAverageShsOutDil ?? previous?.weightedAverageShsOut)
  const netIncome = metricNum(latest?.netIncome)
  const previousNetIncome = metricNum(previous?.netIncome)
  const revenue = metricNum(latest?.revenue)
  const grossProfit = metricNum(latest?.grossProfit)
  const ebitda = metricNum(latest?.ebitda)
  const equity = metricNum(balance?.totalStockholdersEquity)
  const currentAssets = metricNum(balance?.totalCurrentAssets)
  const currentLiabilities = metricNum(balance?.totalCurrentLiabilities)
  const cash = metricNum(balance?.cashAndShortTermInvestments)
  const shortTermDebt = metricNum(balance?.shortTermDebt)
  const longTermDebt = metricNum(balance?.longTermDebt)
  const derivedDebt = shortTermDebt !== null || longTermDebt !== null
    ? (shortTermDebt ?? 0) + (longTermDebt ?? 0)
    : null
  const totalDebt = metricNum(
    balance?.totalDebt ??
    balance?.totalDebtAndCapitalLeaseObligations ??
    derivedDebt
  )
  const netDebt = metricNum(balance?.netDebt) ?? (
    totalDebt !== null && cash !== null ? totalDebt - cash : null
  )
  const dividendsPaidRaw = cashFlow?.dividendsPaid ?? cashFlow?.netDividendsPaid
  const dividendsPaid = dividendsPaidRaw != null ? Math.abs(Number(dividendsPaidRaw)) : null

  const epsRaw = metricNum(latest?.epsdiluted ?? latest?.eps)
  const previousEpsRaw = metricNum(previous?.epsdiluted ?? previous?.eps)
  const epsValue = epsRaw ?? div(netIncome, shares)
  const previousEps = previousEpsRaw ?? div(previousNetIncome, previousShares)
  const vpaValue = div(equity, shares)
  const peValue = div(price, epsValue) ?? metricNum(ratios?.priceToEarningsRatioTTM)
  const pVpaValue = div(price, vpaValue) ?? metricNum(ratios?.priceToBookRatioTTM)
  const cagrEpsValue = epsValue !== null && previousEps !== null && previousEps !== 0
    ? ((epsValue / previousEps) - 1) * 100
    : null
  const pegValue = div(peValue, cagrEpsValue) ??
    metricNum(ratios?.forwardPriceToEarningsGrowthRatioTTM ?? ratios?.priceToEarningsGrowthRatioTTM)
  const dividendPerShare = div(dividendsPaid, shares)

  const result = {
    ticker,
    name:      profile.companyName ?? ticker,
    sector:    profile.sector ?? null,
    industry:  profile.industry ?? null,
    price,
    change:    profile.changePercentage ?? null,
    beta:      num(profile.beta),
    marketCap: profile.marketCap ?? null,
    currency:  profile.currency ?? 'USD',
    metrics: {
      eps:              epsValue !== null ? round2(epsValue) : null,
      pe:               peValue !== null ? round2(peValue) : null,
      vpa:              vpaValue !== null ? round2(vpaValue) : null,
      pVpa:             pVpaValue !== null ? round2(pVpaValue) : null,
      cagrEps:          cagrEpsValue !== null ? round2(cagrEpsValue) : null,
      peg:              pegValue !== null ? round2(pegValue) : null,
      grossMargin:      roundedRatio(grossProfit, revenue, 100) ?? safe(ratios?.grossProfitMarginTTM, 100),
      ebitdaMargin:     roundedRatio(ebitda, revenue, 100),
      netMargin:        roundedRatio(netIncome, revenue, 100) ?? safe(ratios?.netProfitMarginTTM, 100),
      roe:              roundedRatio(netIncome, equity, 100) ?? safe(keyMetrics?.returnOnEquityTTM, 100),
      netDebtToEbitda:  roundedRatio(netDebt, ebitda) ?? num(keyMetrics?.netDebtToEBITDATTM),
      currentRatio:     roundedRatio(currentAssets, currentLiabilities) ?? num(ratios?.currentRatioTTM),
      cashRatio:        roundedRatio(cash, currentLiabilities) ?? num(ratios?.cashRatioTTM),
      dividendYield:    dividendPerShare !== null && price !== null && price !== 0
        ? round2((dividendPerShare / price) * 100)
        : safe(ratios?.dividendYieldTTM, 100),
      payoutRatio:      dividendPerShare !== null && epsValue !== null && epsValue !== 0
        ? round2((dividendPerShare / epsValue) * 100)
        : safe(ratios?.dividendPayoutRatioTTM, 100),
    },
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}
