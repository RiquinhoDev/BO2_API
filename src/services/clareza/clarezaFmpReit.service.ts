import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import { getFmpApiKey } from '../requestDrivenRuntimeConfig'
import { getClarezaData } from './clarezaFmpData.service'
import { UNIVERSE } from './clarezaFmpUniverse'
import { FMP_BASE, FmpRecord, REIT_CACHE_PREFIX, REIT_CACHE_TTL, REIT_VALUATION_CACHE_PREFIX, aggregateDividends, average, buildFfoRow, calcCagr, cashFlowByYear, div, firstRecord, fmpErrorDetails, fmpGet, fmpGetArray, isRecord, mapClarezaToReit, metricNum, num, round2, roundOrNull, roundedRatio, runWithConcurrency, safe, sleep, yearOf } from './clarezaFmpAnalysisSupport'

export async function getReitAnalysis(rawTicker: string) {
  getFmpApiKey()

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = REIT_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // 1. Reutilizar a cache do cron clareza â€” 0 chamadas FMP para tickers do universo.
  try {
    const universe = await getClarezaData()
    const hit = universe?.find(s => s.ticker === ticker && s.data)
    if (hit) {
      const cachedResult = mapClarezaToReit(hit)
      await cacheService.set(cacheKey, cachedResult, REIT_CACHE_TTL)
      return cachedResult
    }
  } catch {
    /* cache indisponÃ­vel â†’ segue para fetch live */
  }

  // 2. Fora do universo â†’ fetch live (com retry a 429) e cache 24h.
  // Profile com diagnÃ³stico: distingue falha da FMP (key/plano/quota) de ticker inexistente.
  let profile: FmpRecord | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_BASE}/profile`, {
        params: { apikey: getFmpApiKey(), symbol: ticker },
        timeout: 15000
      })
      profile = firstRecord(data)
      break
    } catch (e: unknown) {
      const { status, body, message } = fmpErrorDetails(e)
      if (status === 429 && attempt === 0) {
        await sleep(1500) // rate limit momentÃ¢neo (refresh do cron) â†’ 1 retry
        continue
      }
      throw new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`)
    }
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const ratios  = await fmpGet('/ratios-ttm', { symbol: ticker }); await sleep(150)
  const metrics = await fmpGet('/key-metrics-ttm', { symbol: ticker }); await sleep(150)
  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cf      = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

  const price = profile.price ?? null

  // FFO â‰ˆ Net Income + DepreciaÃ§Ã£o & AmortizaÃ§Ã£o (Ãºltimo exercÃ­cio anual)
  const latest  = incomes[0] ?? null
  const ni0     = latest?.netIncome ?? null
  const da0     = latest?.depreciationAndAmortization ?? cf?.depreciationAndAmortization ?? null
  const shares0 = latest?.weightedAverageShsOut ?? null

  const ffo         = ni0 !== null && da0 !== null ? ni0 + da0 : null
  const ffoPerShare = ffo !== null && shares0 ? ffo / shares0 : null
  const pFfo        = ffoPerShare && price ? round2(price / ffoPerShare) : null
  const ffoYield    = ffoPerShare && price ? round2((ffoPerShare / price) * 100) : null

  // FFO 5Y CAGR a partir da sÃ©rie anual disponÃ­vel (mais recente â†’ mais antigo)
  let ffoCagr5y: number | null = null
  const ffoSeries = incomes
    .map(s =>
      s?.netIncome != null && s?.depreciationAndAmortization != null
        ? s.netIncome + s.depreciationAndAmortization
        : null
    )
    .filter((v: number | null): v is number => v !== null && v > 0)
  if (ffoSeries.length >= 2) {
    const newest = ffoSeries[0]
    const oldest = ffoSeries[ffoSeries.length - 1]
    const years  = ffoSeries.length - 1
    ffoCagr5y = round2((Math.pow(newest / oldest, 1 / years) - 1) * 100)
  }

  const divsPaid  = cf?.netDividendsPaid != null ? Math.abs(cf.netDividendsPaid) : null
  const ffoPayout = divsPaid !== null && ffo && ffo > 0 ? round2((divsPaid / ffo) * 100) : null

  const result = {
    ticker,
    name:      profile.companyName ?? ticker,
    sector:    profile.sector ?? null,
    industry:  profile.industry ?? null,
    price,
    change:    profile.changePercentage ?? null,
    marketCap: profile.marketCap ?? null,
    currency:  profile.currency ?? 'USD',
    metrics: {
      pFfo,
      ffoYield,
      ffoPerShare:     ffoPerShare !== null ? round2(ffoPerShare) : null,
      ffoCagr5y,
      ffoPayout,
      netDebtToEbitda: num(metrics?.netDebtToEBITDATTM),
      evToEbitda:      num(metrics?.evToEBITDATTM),
      dividendYield:   safe(ratios?.dividendYieldTTM, 100),
      payoutRatio:     safe(ratios?.dividendPayoutRatioTTM, 100),
      interestCoverage: num(
        ratios?.interestCoverageRatioTTM ?? ratios?.interestCoverageTTM ?? metrics?.interestCoverageTTM
      ),
    },
    ffoYearsUsed: ffoSeries.length,
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}

export async function getReitValuation(rawTicker: string) {
  getFmpApiKey()

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = REIT_VALUATION_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  let profile: FmpRecord | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_BASE}/profile`, {
        params: { apikey: getFmpApiKey(), symbol: ticker },
        timeout: 15000
      })
      profile = firstRecord(data)
      break
    } catch (e: unknown) {
      const { status, body, message } = fmpErrorDetails(e)
      if (status === 429 && attempt === 0) {
        await sleep(1500)
        continue
      }
      throw new Error(`Falha ao contactar a FMP${status ? ` (HTTP ${status})` : ''}${body ? `: ${body}` : `: ${message || 'erro de rede'}`}`)
    }
  }
  await sleep(150)
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cashFlows = await fmpGetArray('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)

  let enterpriseValues: FmpRecord[] = []
  try {
    enterpriseValues = await fmpGetArray('/enterprise-values', { symbol: ticker, period: 'annual', limit: '6' })
  } catch {
    enterpriseValues = []
  }
  await sleep(150)

  let dividendsRaw: FmpRecord[] = []
  try {
    dividendsRaw = await fmpGetArray('/dividends', { symbol: ticker, limit: '120' })
  } catch {
    dividendsRaw = []
  }
  await sleep(150)

  // Cockpit: balanÃ§o (equity, dÃ­vida) + price target.
  let balance: FmpRecord | null = null
  try {
    balance = await fmpGet('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '1' })
  } catch {
    balance = null
  }
  await sleep(150)

  let priceTarget: number | null = null
  try {
    const pt = await fmpGet('/price-target-summary', { symbol: ticker })
    priceTarget = num(
      pt?.lastMonthAvgPriceTarget ?? pt?.allTimeAvgPriceTarget ?? pt?.targetConsensus ?? pt?.priceTarget
    )
  } catch {
    priceTarget = null
  }
  await sleep(150)

  let peerSymbols: string[] = []
  try {
    // /stock-peers devolve um array de objetos de pares; usar fmpGetArray (nÃ£o fmpGet).
    const peerArr = await fmpGetArray('/stock-peers', { symbol: ticker })
    peerSymbols = peerArr
      .flatMap((peer): unknown[] =>
        Array.isArray(peer?.peersList) ? peer.peersList : [peer?.symbol ?? peer]
      )
      .filter((sym): sym is string => typeof sym === 'string')
      .map(sym => normalizeTicker(sym))
      .filter((sym: string) => isValidTicker(sym) && sym !== ticker)
      .slice(0, 5)
  } catch {
    peerSymbols = []
  }
  // Fallback: se a FMP nÃ£o der pares, usar REITs do universo do cron.
  if (peerSymbols.length === 0) {
    peerSymbols = UNIVERSE
      .filter((s) => s.type === 'reit' && s.ticker !== ticker)
      .slice(0, 5)
      .map((s) => s.ticker)
  }
  await sleep(150)

  const cashByYear = cashFlowByYear(cashFlows)
  const enterpriseByYear = new Map<string, FmpRecord>()
  for (const row of enterpriseValues) {
    const year = yearOf(row)
    if (year) enterpriseByYear.set(year, row)
  }

  const history = incomes
    .map(income => {
      const year = yearOf(income)
      const cashFlow = year ? cashByYear.get(year) : null
      const enterprise = year ? enterpriseByYear.get(year) : null
      const ffoRow = buildFfoRow(income, cashFlow)
      const yearPrice = metricNum(enterprise?.stockPrice ?? enterprise?.price)
      const pFfo = div(yearPrice, ffoRow.ffoPerShare)
      return {
        year,
        price: roundOrNull(yearPrice),
        ffoPerShare: roundOrNull(ffoRow.ffoPerShare),
        pFfo: roundOrNull(pFfo)
      }
    })
    .filter((row) => row.year)

  const latestIncome = incomes[0] ?? null
  const latestYear = yearOf(latestIncome)
  const latestCashFlow = latestYear ? cashByYear.get(latestYear) : cashFlows[0]
  const currentRow = buildFfoRow(latestIncome, latestCashFlow)
  const profileShares = metricNum(profile.sharesOutstanding ?? profile.sharesOut)
  const sharesOut = currentRow.shares ?? profileShares
  const price = metricNum(profile.price)
  const allDividends = aggregateDividends(dividendsRaw)
  // Excluir o ano civil corrente (quase sempre parcial) dos cÃ¡lculos do DDM.
  const currentYear = String(new Date().getUTCFullYear())
  const completeDividends = allDividends.filter((row) => row.year !== currentYear)
  const dividends = completeDividends.length ? completeDividends : allDividends
  // Dividendo anual = Ãºltimo ANO COMPLETO agregado (como o ficheiro Excel);
  // lastDividend (rate anualizado do profile) sÃ³ como fallback. NUNCA o ano parcial.
  const lastDivAnnual = num(profile.lastDividend ?? profile.lastDiv)
  const dividendAnnual = dividends[0]?.annual
    ?? (lastDivAnnual !== null && lastDivAnnual > 0 ? lastDivAnnual : null)
    ?? null
  const dividendCagrValue = calcCagr(dividends.map(row => row.annual))
  const dividendCagr = roundOrNull(dividendCagrValue === null ? null : dividendCagrValue * 100)

  const peerTasks = peerSymbols.map((peerTicker) => async () => {
    const [peerProfile, peerIncomes, peerCashFlows] = await Promise.all([
      fmpGet('/profile', { symbol: peerTicker }),
      fmpGetArray('/income-statement', { symbol: peerTicker, period: 'annual', limit: '1' }),
      fmpGetArray('/cash-flow-statement', { symbol: peerTicker, period: 'annual', limit: '1' })
    ])
    await sleep(150)
    const peerRow = buildFfoRow(peerIncomes[0], peerCashFlows[0])
    const peerPrice = metricNum(peerProfile?.price)
    return {
      ticker: peerTicker,
      name: peerProfile?.companyName ?? peerTicker,
      price: roundOrNull(peerPrice),
      ffoPerShare: roundOrNull(peerRow.ffoPerShare),
      capexPerShare: roundOrNull(peerRow.capexPerShare),
      affoPerShare: roundOrNull(peerRow.affoPerShare),
      pAffo: roundOrNull(div(peerPrice, peerRow.affoPerShare))
    }
  })
  const peers = peerTasks.length ? await runWithConcurrency(peerTasks, 2) : []

  const pFfoAvg = roundOrNull(average(history.slice(0, 5).map((row) => row.pFfo)))
  const pAffoAvg = roundOrNull(average(peers.map((peer) => peer.pAffo)))
  const affoPayout = dividendAnnual !== null && currentRow.affoPerShare
    ? round2((dividendAnnual / currentRow.affoPerShare) * 100)
    : null

  // â”€â”€ Cockpit (resumo de indicadores, auto-preenchido) â”€â”€
  const cRevenue = metricNum(latestIncome?.revenue)
  const cNetIncome = metricNum(latestIncome?.netIncome)
  const cEbitda = metricNum(latestIncome?.ebitda)
  const cGross = metricNum(latestIncome?.grossProfit)
  const cOperating = metricNum(latestIncome?.operatingIncome)
  const cEps = metricNum(latestIncome?.epsdiluted ?? latestIncome?.eps) ?? div(cNetIncome, sharesOut)
  const cEquity = metricNum(balance?.totalStockholdersEquity)
  const cCash = metricNum(balance?.cashAndShortTermInvestments)
  const cTotalDebt = metricNum(
    balance?.totalDebt ?? ((metricNum(balance?.shortTermDebt) ?? 0) + (metricNum(balance?.longTermDebt) ?? 0))
  )
  const cNetDebt = metricNum(balance?.netDebt) ?? (cTotalDebt !== null && cCash !== null ? cTotalDebt - cCash : null)
  const pct = (n: number | null, d: number | null) => roundedRatio(n, d, 100)
  const histReturn = (idx: number) => {
    const past = metricNum(history[idx]?.price)
    return price !== null && past ? round2((price / past - 1) * 100) : null
  }
  const cockpit = {
    revenue: roundOrNull(cRevenue),
    netIncome: roundOrNull(cNetIncome),
    ebitda: roundOrNull(cEbitda),
    equity: roundOrNull(cEquity),
    netDebt: roundOrNull(cNetDebt),
    marketCap: num(profile.marketCap),
    grossMargin: pct(cGross, cRevenue),
    operatingMargin: pct(cOperating, cRevenue),
    netMargin: pct(cNetIncome, cRevenue),
    roe: pct(cNetIncome, cEquity),
    netDebtToEbitda: roundedRatio(cNetDebt, cEbitda),
    pFfo: roundOrNull(div(price, currentRow.ffoPerShare)),
    dividendYield: dividendAnnual !== null && price ? round2((dividendAnnual / price) * 100) : null,
    payoutEarnings: dividendAnnual !== null && cEps ? round2((dividendAnnual / cEps) * 100) : null,
    return1y: histReturn(1),
    return2y: histReturn(2),
    return5y: histReturn(5),
    priceTarget
  }

  const result = {
    ticker,
    name: profile.companyName ?? ticker,
    price: roundOrNull(price),
    beta: num(profile.beta),
    sharesOut: sharesOut !== null ? Math.round(sharesOut) : null,
    currency: profile.currency ?? 'USD',
    current: {
      ffo: roundOrNull(currentRow.ffo),
      ffoPerShare: roundOrNull(currentRow.ffoPerShare),
      affoPerShare: roundOrNull(currentRow.affoPerShare),
      dividendAnnual,
      capex: roundOrNull(currentRow.capex),
      capexPerShare: roundOrNull(currentRow.capexPerShare)
    },
    cockpit,
    history,
    pFfoAvg,
    dividends,
    dividendCagr,
    peers,
    pAffoAvg,
    affoPayout,
    source: 'live',
    updated: new Date().toISOString()
  }

  await cacheService.set(cacheKey, result, REIT_CACHE_TTL)
  return result
}
