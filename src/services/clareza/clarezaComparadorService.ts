import axios from 'axios'
import { cacheService } from '../cache.service'
import { UNIVERSE } from './clarezaFmpService'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import ClarezaComparadorData from '../../models/ClarezaComparadorData'

// ─────────────────────────────────────────────────────────────
// COMPARADOR DE AÇÕES — versão Node (migrada do clareza-comparador.php)
//
// Mesmo padrão das outras ferramentas Clareza:
//  • o cron 6h/12h/18h pré-aquece todo o universo no Redis
//  • ?symbols= e ?search= servem sempre da cache, nunca chamam a FMP
//  • fallback: Redis → MongoDB (snapshot do último refresh)
//
// O refresh por lotes do PHP (?batch=N, ?cron=1, ?cycle=1, ficheiro de
// estado) não foi portado: existe para contornar o limite de execução do
// PHP no WordPress, e aqui o cron + Redis/Mongo já tratam disso.
// ─────────────────────────────────────────────────────────────

const FMP_BASE = 'https://financialmodelingprep.com/stable'

const COMPARADOR_CACHE_KEY = 'clareza:comparador:v1'

// 25h: cobre a maior janela entre refreshes do cron (18h→6h) com folga.
const COMPARADOR_TTL = 90000

// Limites do PHP, mantidos para o contrato ficar igual.
const MAX_SYMBOLS = 4   // por pedido de comparação
const MAX_FORCE   = 10  // por refresh manual de símbolos específicos

// Universo = o mesmo do Termómetro (já inclui internacionais e REITs).
// A lista do PHP é um subconjunto deste: não tem os 26 REITs.
export const COMPARADOR_UNIVERSE = UNIVERSE

type ComparadorCache = { updated: string | null; stocks: Record<string, any> }

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const round2 = (n: number) => Math.round(n * 100) / 100

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

// Todas as chamadas passam pelo gate global partilhado pelas ferramentas Clareza.
async function fmpGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!process.env.FMP_API_KEY) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    await fmpThrottle()
    try {
      const { data } = await axios.get(`${FMP_BASE}${path}`, {
        params: { apikey: process.env.FMP_API_KEY, ...params },
        timeout: 15000
      })
      if (!data) return null
      if (!Array.isArray(data) && (data as any)['Error Message']) return null
      return (Array.isArray(data) ? (data[0] ?? null) : data) as T
    } catch (e: any) {
      if (e?.response?.status === 429 && attempt < 2) {
        await sleep(2000)
        continue
      }
      return null
    }
  }
  return null
}

// Igual ao safe() do PHP: multiplica e arredonda a 4 casas, null se não numérico.
function safe(val: any, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

function isReitProfile(p: any): boolean {
  const sector = String(p?.sector ?? '').toLowerCase()
  const industry = String(p?.industry ?? '').toLowerCase()
  return sector.includes('real estate') || industry.includes('reit')
}

// ─────────────────────────────────────────────────────────────
// FETCH DE UMA EMPRESA (espelha fetch_company do PHP)
// ─────────────────────────────────────────────────────────────

export async function fetchCompanyComparador(ticker: string): Promise<any | null> {
  let p = await fmpGet('/profile', { symbol: ticker })
  if (!p) p = await fmpGet('/quote', { symbol: ticker })
  if (!p) return null

  const r  = (await fmpGet('/ratios-ttm', { symbol: ticker })) ?? {}
  const km = (await fmpGet('/key-metrics-ttm', { symbol: ticker })) ?? {}

  const price: number | null = (p as any).price ?? null
  const isReit = isReitProfile(p)

  // Performance a 12 meses aproximada, a partir do intervalo de 52 semanas.
  let perf12m: number | null = null
  const range = (p as any).range
  if (range && price) {
    const parts = String(range).split('-')
    if (parts.length === 2) {
      const low52 = parseFloat(parts[0].trim())
      if (low52 > 0) perf12m = round2(((price - low52) / low52) * 100)
    }
  }

  const gr = (await fmpGet('/grades-consensus', { symbol: ticker })) ?? {}
  const pt = (await fmpGet('/price-target-consensus', { symbol: ticker })) ?? {}

  const targetConsensus = (pt as any).targetConsensus ?? null
  const upside = targetConsensus && price
    ? Math.round(((targetConsensus - price) / price) * 1000) / 10
    : null

  // FFO aproximado para REITs (Lucro Líquido + Depreciação/Amortização)
  let pFfo: number | null = null
  let ffoPayout: number | null = null
  if (isReit) {
    const is = (await fmpGet('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })) ?? {}
    const cf = (await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })) ?? {}
    const ni     = (is as any).netIncome ?? null
    const da     = (is as any).depreciationAndAmortization ?? (cf as any).depreciationAndAmortization ?? null
    const shares = (is as any).weightedAverageShsOut ?? null
    const divs   = (cf as any).netDividendsPaid != null ? Math.abs((cf as any).netDividendsPaid) : null

    if (ni !== null && da !== null) {
      const ffo = ni + da
      if (shares && shares > 0 && price) {
        const ffoPs = ffo / shares
        if (ffoPs > 0) pFfo = round2(price / ffoPs)
      }
      if (divs !== null && ffo > 0) ffoPayout = round2((divs / ffo) * 100)
    }
  }

  const P = p as any, R = r as any, KM = km as any, GR = gr as any

  return {
    ticker,
    name:     P.companyName ?? P.name ?? ticker,
    image:    P.image ?? null,
    sector:   P.sector ?? null,
    industry: P.industry ?? null,
    country:  P.country ?? null,
    currency: P.currency ?? 'USD',
    exchange: P.exchangeShortName ?? P.exchange ?? null,
    isReit,
    price,
    change:    P.changePercentage ?? null,
    perf12m,
    marketCap: P.marketCap ?? KM.marketCap ?? null,
    beta:      P.beta ?? null,
    // Valuation
    pe:       R.priceToEarningsRatioTTM ?? null,
    peg:      R.forwardPriceToEarningsGrowthRatioTTM ?? R.priceToEarningsGrowthRatioTTM ?? null,
    ps:       R.priceToSalesRatioTTM ?? null,
    pb:       R.priceToBookRatioTTM ?? null,
    evEbitda: KM.evToEBITDATTM ?? null,
    pFfo,
    // Qualidade / saúde
    grossMargin: safe(R.grossProfitMarginTTM, 100),
    netMargin:   safe(R.netProfitMarginTTM, 100),
    roe:         safe(KM.returnOnEquityTTM, 100),
    roic:        safe(KM.returnOnInvestedCapitalTTM ?? KM.roicTTM, 100),
    fcfYield:    safe(KM.freeCashFlowYieldTTM, 100),
    debtEquity:  R.debtToEquityRatioTTM ?? null,
    debtEbitda:  KM.netDebtToEBITDATTM ?? null,
    // Rendimento
    dividendYield: safe(R.dividendYieldTTM, 100),
    payoutRatio:   safe(R.dividendPayoutRatioTTM, 100),
    ffoPayout,
    // Analistas
    analystConsensus: GR.consensus ?? null,
    strongBuy:  GR.strongBuy ?? null,
    buy:        GR.buy ?? null,
    hold:       GR.hold ?? null,
    sell:       GR.sell ?? null,
    strongSell: GR.strongSell ?? null,
    targetConsensus,
    upside,
    updated: new Date().toISOString()
  }
}

// ─────────────────────────────────────────────────────────────
// REFRESH COMPLETO (cron + endpoint manual)
// ─────────────────────────────────────────────────────────────

export async function refreshClarezaComparadorData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`⚖️ [Comparador] Iniciando refresh de ${COMPARADOR_UNIVERSE.length} ações...`)

  let errors = 0
  const stocks: Record<string, any> = {}

  await runWithConcurrency(
    COMPARADOR_UNIVERSE.map(item => async () => {
      try {
        const data = await fetchCompanyComparador(item.ticker)
        if (data && data.price != null) {
          stocks[item.ticker] = data
        } else {
          errors++
          console.warn(`⚠️ [Comparador] Sem dados para ${item.ticker}`)
        }
      } catch (err: any) {
        errors++
        console.error(`❌ [Comparador] Erro em ${item.ticker}:`, err.message)
      }
    }),
    // O fmpThrottle global já garante o ritmo; a concorrência só encurta o ciclo.
    8
  )

  const payload: ComparadorCache = { updated: new Date().toISOString(), stocks }

  await cacheService.set(COMPARADOR_CACHE_KEY, payload, COMPARADOR_TTL)

  try {
    await ClarezaComparadorData.create({
      fetchedAt:  new Date(),
      stockCount: Object.keys(stocks).length,
      errors,
      stocks
    })
    // Manter apenas os últimos 5 snapshots
    const all = await ClarezaComparadorData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      await ClarezaComparadorData.deleteMany({ _id: { $in: all.slice(5).map((d: any) => d._id) } })
    }
    console.log('💾 [Comparador] Snapshot guardado na BD')
  } catch (err: any) {
    console.error('⚠️ [Comparador] Erro ao guardar snapshot na BD:', err.message)
  }

  const total = Object.keys(stocks).length
  console.log(`✅ [Comparador] Refresh completo — ${total} ok, ${errors} erros (de ${COMPARADOR_UNIVERSE.length})`)

  return { total, errors }
}

// ─────────────────────────────────────────────────────────────
// LEITURA DA CACHE (Redis → MongoDB)
// ─────────────────────────────────────────────────────────────

async function getComparadorCache(): Promise<ComparadorCache | null> {
  const cached = await cacheService.get<ComparadorCache>(COMPARADOR_CACHE_KEY)
  if (cached?.stocks) return cached

  try {
    const latest = await ClarezaComparadorData.findOne().sort({ fetchedAt: -1 }).lean()
    const stocks = (latest as any)?.stocks
    if (stocks && Object.keys(stocks).length) {
      console.log('📦 [Comparador] Cache Redis vazia — a servir snapshot da BD')
      const payload: ComparadorCache = {
        updated: (latest as any).fetchedAt?.toISOString?.() ?? null,
        stocks
      }
      await cacheService.set(COMPARADOR_CACHE_KEY, payload, COMPARADOR_TTL)
      return payload
    }
  } catch (err: any) {
    console.error('⚠️ [Comparador] Erro ao ler snapshot da BD:', err.message)
  }

  console.warn('[Comparador] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}

// Normaliza e valida a lista de símbolos vinda da querystring.
function parseSymbols(raw: string, max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(raw || '').split(',')) {
    const t = normalizeTicker(part)
    if (!t || !isValidTicker(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// ENDPOINTS — servem sempre da cache, nunca chamam a FMP
// ─────────────────────────────────────────────────────────────

export async function getComparadorSymbols(rawSymbols: string): Promise<any> {
  const symbols = parseSymbols(rawSymbols, MAX_SYMBOLS)
  if (!symbols.length) {
    return { error: 'Sem símbolos válidos.', companies: [] }
  }

  const cache = await getComparadorCache()
  const stocks = cache?.stocks ?? {}

  const companies = symbols.map(sym => stocks[sym] ?? {
    ticker: sym,
    error: `${sym} ainda não está disponível no Comparador.`
  })

  return { count: companies.length, updated: cache?.updated ?? null, companies }
}

export async function searchComparador(rawQuery: string): Promise<any> {
  const q = String(rawQuery || '').trim().toUpperCase()
  const cache = await getComparadorCache()
  const stocks = cache?.stocks ?? {}

  const ranked = Object.entries(stocks)
    .map(([ticker, c]: [string, any]) => {
      const tk = ticker.toUpperCase()
      const name = String(c?.name ?? '').toUpperCase()
      let rank: number | null = null

      if (q === '') rank = 3
      else if (tk === q) rank = 0
      else if (tk.startsWith(q)) rank = 1
      else if (name.startsWith(q)) rank = 2
      else if (tk.includes(q) || name.includes(q)) rank = 3

      if (rank === null) return null
      return {
        rank,
        result: {
          symbol:   ticker,
          name:     c?.name ?? ticker,
          sector:   c?.sector ?? null,
          exchange: c?.exchange ?? null,
          image:    c?.image ?? null,
          isReit:   c?.isReit ?? false
        }
      }
    })
    .filter((e): e is { rank: number; result: any } => e !== null)
    .sort((a, b) => a.rank - b.rank || a.result.symbol.localeCompare(b.result.symbol))
    .map(e => e.result)

  return { query: q, count: ranked.length, results: ranked.slice(0, 20) }
}

// Refresh manual de símbolos específicos (equivalente ao
// ?refresh=...&symbols=AAPL,MSFT do PHP). Aqui SIM vai à FMP.
export async function refreshComparadorSymbols(rawSymbols: string): Promise<any> {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const symbols = parseSymbols(rawSymbols, MAX_FORCE)
  if (!symbols.length) return { error: 'Sem símbolos válidos.' }

  const cache = (await getComparadorCache()) ?? { updated: null, stocks: {} }
  const updated: string[] = []
  const failed: string[] = []

  for (const sym of symbols) {
    const data = await fetchCompanyComparador(sym)
    if (data && data.price != null) {
      cache.stocks[sym] = data
      updated.push(sym)
    } else {
      failed.push(sym)
    }
  }

  cache.updated = new Date().toISOString()
  await cacheService.set(COMPARADOR_CACHE_KEY, cache, COMPARADOR_TTL)

  return { ok: true, updated, failed }
}
