// Ferramentas OGI — análise de REITs e de ações a partir da Financial Modeling
// Prep. Nada disto pertence ao Clareza: estava debaixo de /api/clareza apenas
// por partilhar o cliente da FMP, e foi isso que a fez desaparecer numa limpeza
// do runtime legado do Clareza a 2 de Setembro de 2026, levando atrás as três
// ferramentas que a Comunidade publica em osriquinhos.serriquinho.com.
//
// Recuperado de cfc1e58d, com três diferenças em relação ao original:
//
//   • as chamadas passam pelo `clarezaFmpJsonClient`, que limita o ritmo,
//     deduplica pedidos em voo, respeita o minuto da quota ao apanhar um 429 e
//     é contado pelo painel de capacidade. O original falava com a FMP por
//     axios directo, sem nada disso;
//   • o enriquecimento a partir da cache do universo do Clareza saiu — o modelo
//     que a guardava já não existe. Era um atalho opcional dentro de um
//     try/catch; sem ele, a análise é sempre ao vivo;
//   • a lista de pares para comparação deixa de vir do universo de 220 nomes e
//     passa a ser uma constante, que era o único uso que aquilo tinha aqui.
//
// A cache por ticker em Redis fica: é ela que evita repetir uma dúzia de
// chamadas à FMP por cada consulta repetida do mesmo símbolo.

import { cacheService } from '../cache.service'
import { clarezaFmpJsonClient } from '../clareza/fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../clareza/fmpJsonClient'
import { normalizeTicker, isValidTicker } from './tickerUtils'
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

type FmpRecord = Partial<Record<FmpNumericField, number | null>> & {
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

const STOCK_CACHE_PREFIX = 'ogi:tools:stock:v2:'
const REIT_CACHE_PREFIX = 'ogi:tools:reit:v2:'
const REIT_VALUATION_CACHE_PREFIX = 'ogi:tools:reitval:v2:'
const REIT_CACHE_TTL = 86400 // 24 horas

/** Pares de comparação quando a FMP não devolve nenhum. */
const REIT_PEER_FALLBACK = ['O', 'VICI', 'PLD', 'SPG', 'WELL', 'AMT'] as const

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Um registo da FMP, ou null. O cliente já trata de ritmo, retry e dedup. */
async function fmpGet(path: string, params: Record<string, string> = {}): Promise<FmpRecord | null> {
  getFmpApiKey()
  const data = await clarezaFmpJsonClient.getOrThrow({
    baseUrl: FMP_STABLE_BASE_URL,
    path,
    params,
  })
  return firstRecord(data)
}

/** O array completo, para as demonstrações financeiras de vários exercícios. */
async function fmpGetArray(path: string, params: Record<string, string> = {}): Promise<FmpRecord[]> {
  getFmpApiKey()
  const data = await clarezaFmpJsonClient.getOrThrow({
    baseUrl: FMP_STABLE_BASE_URL,
    path,
    params,
  })
  return recordArray(data)
}

function isRecord(value: unknown): value is FmpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstRecord(value: unknown): FmpRecord | null {
  if (Array.isArray(value)) return value.find(isRecord) ?? null
  return isRecord(value) ? value : null
}

function recordArray(value: unknown): FmpRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  return isRecord(value) ? [value] : []
}

function safe(val: unknown, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

// ─────────────────────────────────────────────────────────────
// FETCH POR AÇÃO
// ─────────────────────────────────────────────────────────────


// Limita concorrência sem depender de p-queue (ESM-only)
async function runWithConcurrency<T>(
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



const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number | null =>
  v === null || v === undefined || isNaN(Number(v)) ? null : round2(Number(v))


// Mapeia uma entrada da cache do cron clareza para o formato da análise REIT.
// Evita chamadas FMP para os tickers que o cron já atualiza 3×/dia.

function div(a: number | null, b: number | null): number | null {
  return a !== null && b !== null && b !== 0 ? a / b : null
}

function roundedRatio(a: number | null, b: number | null, multiplier = 1): number | null {
  const ratio = div(a, b)
  return ratio === null ? null : round2(ratio * multiplier)
}

function metricNum(v: unknown): number | null {
  return v === null || v === undefined || isNaN(Number(v)) ? null : Number(v)
}

function roundOrNull(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : round2(v)
}

function yearOf(row: FmpRecord | null | undefined): string | null {
  return String(row?.calendarYear ?? row?.year ?? row?.date ?? '').slice(0, 4) || null
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function calcCagr(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0)
  if (valid.length < 2) return null
  const newest = valid[0]
  const oldest = valid[valid.length - 1]
  return Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1
}

function buildFfoRow(income: FmpRecord | null | undefined, cashFlow?: FmpRecord | null) {
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

function cashFlowByYear(cashFlows: FmpRecord[]) {
  const byYear = new Map<string, FmpRecord>()
  for (const row of cashFlows) {
    const year = yearOf(row)
    if (year) byYear.set(year, row)
  }
  return byYear
}

function aggregateDividends(rows: FmpRecord[]) {
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


export async function getReitAnalysis(rawTicker: string) {
  getFmpApiKey()

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = REIT_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // 1. Reutilizar a cache do cron clareza — 0 chamadas FMP para tickers do universo.

  // 2. Fora do universo → fetch live (com retry a 429) e cache 24h.
  // Profile com diagnóstico: distingue falha da FMP (key/plano/quota) de ticker inexistente.
  const profile = await fmpGet('/profile', { symbol: ticker })
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const ratios  = await fmpGet('/ratios-ttm', { symbol: ticker }); await sleep(150)
  const metrics = await fmpGet('/key-metrics-ttm', { symbol: ticker }); await sleep(150)
  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cf      = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

  const price = profile.price ?? null

  // FFO ≈ Net Income + Depreciação & Amortização (último exercício anual)
  const latest  = incomes[0] ?? null
  const ni0     = latest?.netIncome ?? null
  const da0     = latest?.depreciationAndAmortization ?? cf?.depreciationAndAmortization ?? null
  const shares0 = latest?.weightedAverageShsOut ?? null

  const ffo         = ni0 !== null && da0 !== null ? ni0 + da0 : null
  const ffoPerShare = ffo !== null && shares0 ? ffo / shares0 : null
  const pFfo        = ffoPerShare && price ? round2(price / ffoPerShare) : null
  const ffoYield    = ffoPerShare && price ? round2((ffoPerShare / price) * 100) : null

  // FFO 5Y CAGR a partir da série anual disponível (mais recente → mais antigo)
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

  const profile = await fmpGet('/profile', { symbol: ticker })
  if (!profile || !profile.symbol) throw new Error('Ticker nao encontrado')

  const incomes = await fmpGetArray('/income-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)
  const cashFlows = await fmpGetArray('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '6' }); await sleep(150)

  let enterpriseValues: FmpRecord[]
  try {
    enterpriseValues = await fmpGetArray('/enterprise-values', { symbol: ticker, period: 'annual', limit: '6' })
  } catch {
    enterpriseValues = []
  }
  await sleep(150)

  let dividendsRaw: FmpRecord[]
  try {
    dividendsRaw = await fmpGetArray('/dividends', { symbol: ticker, limit: '120' })
  } catch {
    dividendsRaw = []
  }
  await sleep(150)

  // Cockpit: balanço (equity, dívida) + price target.
  let balance: FmpRecord | null
  try {
    balance = await fmpGet('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '1' })
  } catch {
    balance = null
  }
  await sleep(150)

  let priceTarget: number | null
  try {
    const pt = await fmpGet('/price-target-summary', { symbol: ticker })
    priceTarget = num(
      pt?.lastMonthAvgPriceTarget ?? pt?.allTimeAvgPriceTarget ?? pt?.targetConsensus ?? pt?.priceTarget
    )
  } catch {
    priceTarget = null
  }
  await sleep(150)

  let peerSymbols: string[]
  try {
    // /stock-peers devolve um array de objetos de pares; usar fmpGetArray (não fmpGet).
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
  // Fallback: se a FMP não der pares, usar REITs do universo do cron.
  if (peerSymbols.length === 0) {
    peerSymbols = REIT_PEER_FALLBACK.filter((symbol) => symbol !== ticker).slice(0, 5)
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
  // Excluir o ano civil corrente (quase sempre parcial) dos cálculos do DDM.
  const currentYear = String(new Date().getUTCFullYear())
  const completeDividends = allDividends.filter((row) => row.year !== currentYear)
  const dividends = completeDividends.length ? completeDividends : allDividends
  // Dividendo anual = último ANO COMPLETO agregado (como o ficheiro Excel);
  // lastDividend (rate anualizado do profile) só como fallback. NUNCA o ano parcial.
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

  // ── Cockpit (resumo de indicadores, auto-preenchido) ──
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

export async function getStockAnalysis(rawTicker: string) {
  getFmpApiKey()

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const cacheKey = STOCK_CACHE_PREFIX + ticker
  const cached = await cacheService.get<unknown>(cacheKey)
  if (isRecord(cached)) return cached

  // Calcula sempre live (16 indicadores das demonstrações). A cache do cron
  // (parcial) é usada apenas como fallback se a FMP falhar (ver catch abaixo).
  const profile = await fmpGet('/profile', { symbol: ticker })
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
