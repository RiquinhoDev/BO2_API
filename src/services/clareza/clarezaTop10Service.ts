import axios from 'axios'
import { cacheService } from '../cache.service'
import ClarezaTop10Data from '../../models/ClarezaTop10Data'

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

const FMP_STABLE = 'https://financialmodelingprep.com/stable'
const FMP_V3 = 'https://financialmodelingprep.com/api/v3'
export const CLAREZA_TOP10_CACHE_KEY = 'clareza:top10-data'
const CACHE_TTL = 28800 // 8 horas (alinhado com o Tremómetro)
const HISTORY_YEARS = 5 // histórico máximo por ação
const REVISION = 'Q2 2026'

// ─────────────────────────────────────────────────────────────
// WATCHLIST Q2 2026 — Top 10 ações da equipa (alinhado com o HTML/PHP)
// Pedro: MU, GOOGL, TSM, NVDA, PLTR
// Rui:   ASML, META, RACE (Ferrari), NBIS (Nebius), SPCX (SpaceX)
// SpaceX: ainda sem dados FMP úteis → usa fallback manual de IPO.
// ─────────────────────────────────────────────────────────────

const WATCHLIST = [
  { ticker: 'MU',    name: 'Micron Technology',        exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'GOOGL', name: 'Alphabet Inc.',            exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'TSM',   name: 'Taiwan Semiconductor',     exchange: 'NYSE',   currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'NVDA',  name: 'Nvidia Corporation',       exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'PLTR',  name: 'Palantir Technologies',    exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'ASML',  name: 'ASML Holding',             exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'META',  name: 'Meta Platforms',           exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'RACE',  name: 'Ferrari NV',               exchange: 'NYSE',   currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'NBIS',  name: 'Nebius Group N.V.',        exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'SPCX',  name: 'SpaceX',                   exchange: 'NASDAQ', currency: '$', isPrivate: false, ipoFallback: true },
]

// ─────────────────────────────────────────────────────────────
// FMP HELPERS (stable + fallback v3)
// ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const isEmpty = (v: any) => v === null || v === undefined ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

// Primeiro elemento — endpoints STABLE (?symbol=)
async function fmpFirstStable<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    const { data } = await axios.get(`${FMP_STABLE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    if (!data || (data as any)['Error Message']) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T
    return data as T
  } catch {
    return null
  }
}

// Primeiro elemento — endpoints v3 (ticker no path)
async function fmpFirstV3<T = any>(pathWithTicker: string): Promise<T | null> {
  try {
    const { data } = await axios.get(`${FMP_V3}${pathWithTicker}`, {
      params: { apikey: process.env.FMP_API_KEY },
      timeout: 15000
    })
    if (!data || (data as any)['Error Message']) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T
    return data as T
  } catch {
    return null
  }
}

function ymd(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Histórico: STABLE light → fallback v3 historical-price-full → normalizado {date, close}
async function fetchHistorical(ticker: string, from: string, to: string): Promise<Array<{ date: string; close: number }>> {
  let rows: any[] = []
  try {
    const { data } = await axios.get(`${FMP_STABLE}/historical-price-eod/light`, {
      params: { apikey: process.env.FMP_API_KEY, symbol: ticker, from, to },
      timeout: 20000
    })
    if (Array.isArray(data)) rows = data
  } catch { /* ignora */ }

  if (!rows.length) {
    try {
      const { data } = await axios.get(`${FMP_V3}/historical-price-full/${ticker}`, {
        params: { apikey: process.env.FMP_API_KEY, from, to },
        timeout: 20000
      })
      if (data && Array.isArray(data.historical)) rows = data.historical
    } catch { /* ignora */ }
  }

  const out: Array<{ date: string; close: number }> = []
  for (const r of rows) {
    const date = r?.date ?? null
    const close = r?.price ?? r?.close ?? r?.adjClose ?? null
    if (date && close !== null && !isNaN(Number(close))) {
      out.push({ date: String(date).slice(0, 10), close: Math.round(Number(close) * 100) / 100 })
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}

// ─────────────────────────────────────────────────────────────
// FETCH POR AÇÃO
// ─────────────────────────────────────────────────────────────

async function fetchPublicStock(ticker: string) {
  // 1) STABLE
  let profile = await fmpFirstStable('/profile', { symbol: ticker });        await sleep(150)
  let ratios  = await fmpFirstStable('/ratios-ttm', { symbol: ticker });     await sleep(150)
  let metrics = await fmpFirstStable('/key-metrics-ttm', { symbol: ticker }); await sleep(150)

  // 2) Fallback v3 quando a STABLE devolve vazio (ex.: NBIS, RACE)
  if (isEmpty(profile)) { profile = await fmpFirstV3(`/profile/${ticker}`);          await sleep(150) }
  if (isEmpty(ratios))  { ratios  = await fmpFirstV3(`/ratios-ttm/${ticker}`);        await sleep(150) }
  if (isEmpty(metrics)) { metrics = await fmpFirstV3(`/key-metrics-ttm/${ticker}`);   await sleep(150) }

  const from = new Date()
  from.setFullYear(from.getFullYear() - HISTORY_YEARS)
  const historical = await fetchHistorical(ticker, ymd(from), ymd(new Date()))

  return {
    profile:    isEmpty(profile) ? {} : profile,
    ratios:     isEmpty(ratios) ? {} : ratios,
    keyMetrics: isEmpty(metrics) ? {} : metrics,
    historical,
    updated:    new Date().toISOString()
  }
}

// SpaceX antes de IPO — dados manuais enquanto a FMP não devolve nada útil
function spacexIpoFallbackPayload() {
  return {
    profile: {
      symbol: 'SPCX',
      price: 135,
      marketCap: 1770000000000,
      companyName: 'SpaceX',
      currency: 'USD',
      exchangeFullName: 'NASDAQ',
      exchange: 'NASDAQ',
      industry: 'Aerospace & Defense',
      sector: 'Industrials',
      country: 'US',
      image: 'https://lp.serriquinho.com/wp-content/uploads/2026/06/SpaceX_logo_PNG3.png',
      description: 'SpaceX designs, manufactures and launches advanced rockets and spacecraft, and operates Starlink, a satellite internet constellation.',
      ipoDate: '2026-06-12',
      isActivelyTrading: false
    },
    ratios: {},
    keyMetrics: { marketCap: 1770000000000 },
    historical: [],
    ipoInfo: {
      ipoPrice: 135,
      listingDate: '2026-06-12',
      valuation: 1770000000000,
      tickerSymbol: 'SPCX',
      exchange: 'NASDAQ',
      status: 'pending'
    },
    updated: new Date().toISOString()
  }
}

function privateStockPayload() {
  return {
    profile: { price: null, changesPercentage: null, changePercentage: null, sector: 'Privada', country: '—' },
    ratios: {},
    keyMetrics: {},
    historical: [],
    updated: new Date().toISOString(),
    isPrivate: true
  }
}

// ─────────────────────────────────────────────────────────────
// REFRESH COMPLETO (chamado pelo cron ClarezaRefresh e pelo endpoint manual)
// ─────────────────────────────────────────────────────────────

export async function refreshClarezaTop10Data(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`📈 [ClarezaTop10] Iniciando refresh de ${WATCHLIST.length} ações (${REVISION})...`)

  let errors = 0

  const entries = await runWithConcurrency(
    WATCHLIST.map(stock => async () => {
      if (stock.isPrivate) {
        return { ticker: stock.ticker, payload: privateStockPayload() }
      }
      try {
        let payload: any = await fetchPublicStock(stock.ticker)

        // SPCX: usa fallback manual de IPO enquanto a FMP não tiver preço nem histórico
        if (stock.ipoFallback) {
          const price = payload.profile?.price
          const hasPrice = price !== null && price !== undefined && !isNaN(Number(price))
          const hasHist = Array.isArray(payload.historical) && payload.historical.length > 0
          if (!hasPrice && !hasHist) payload = spacexIpoFallbackPayload()
        }

        return { ticker: stock.ticker, payload }
      } catch (err: any) {
        errors++
        console.error(`❌ [ClarezaTop10] Erro em ${stock.ticker}:`, err.message)
        return { ticker: stock.ticker, payload: null }
      }
    }),
    2 // 2 ações em simultâneo — dentro dos limites da FMP
  )

  const stocks: Record<string, any> = {}
  for (const e of entries) {
    if (e.payload) stocks[e.ticker] = e.payload
  }

  const payload = {
    updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    source: 'Financial Modeling Prep',
    revision: REVISION,
    stocks
  }

  // Guardar em Redis
  await cacheService.set(CLAREZA_TOP10_CACHE_KEY, payload, CACHE_TTL)

  // Guardar em MongoDB (persistência durável — mesmo se Redis reiniciar)
  try {
    await ClarezaTop10Data.create({
      fetchedAt:  new Date(),
      stockCount: Object.keys(stocks).length,
      errors,
      payload
    })
    // Manter apenas os últimos 5 snapshots
    const all = await ClarezaTop10Data.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map((d: any) => d._id)
      await ClarezaTop10Data.deleteMany({ _id: { $in: toDelete } })
    }
    console.log(`💾 [ClarezaTop10] Snapshot guardado na BD`)
  } catch (err: any) {
    console.error('⚠️ [ClarezaTop10] Erro ao guardar snapshot na BD:', err.message)
  }

  console.log(`✅ [ClarezaTop10] Refresh completo — ${Object.keys(stocks).length} ok, ${errors} erros`)

  return { total: WATCHLIST.length, errors }
}

// ─────────────────────────────────────────────────────────────
// GET COM CACHE (Redis → MongoDB → null)
// ─────────────────────────────────────────────────────────────

export async function getClarezaTop10Data(): Promise<any | null> {
  // 1. Tentar Redis
  const cached = await cacheService.get<any>(CLAREZA_TOP10_CACHE_KEY)
  if (cached) return cached

  // 2. Redis miss → tentar MongoDB (último snapshot persistido)
  try {
    const latest = await ClarezaTop10Data.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.payload?.stocks && Object.keys(latest.payload.stocks).length) {
      console.log(`📦 [ClarezaTop10] Cache Redis vazio — a servir snapshot da BD (${latest.fetchedAt})`)
      await cacheService.set(CLAREZA_TOP10_CACHE_KEY, latest.payload, CACHE_TTL)
      return latest.payload
    }
  } catch (err: any) {
    console.error('⚠️ [ClarezaTop10] Erro ao ler snapshot da BD:', err.message)
  }

  // 3. Nenhum dado disponível. Não chamar FMP em load público.
  console.warn('[ClarezaTop10] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}
