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

const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_TOP10_CACHE_KEY = 'clareza:top10-data'
const CACHE_TTL = 28800 // 8 horas (alinhado com o Tremómetro)
const HISTORY_YEARS = 5 // histórico máximo por ação

// ─────────────────────────────────────────────────────────────
// WATCHLIST — Top 10 ações da equipa (alinhado com o HTML/PHP)
// SpaceX é privada → não vai à FMP.
// ─────────────────────────────────────────────────────────────

const WATCHLIST = [
  { ticker: 'MU',    name: 'Micron Technology',            exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'GOOGL', name: 'Alphabet Inc.',                exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'TSM',   name: 'Taiwan Semiconductor (TSMC)',  exchange: 'NYSE',    currency: '$', isPrivate: false },
  { ticker: 'NVDA',  name: 'Nvidia Corporation',           exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'RKLB',  name: 'Rocket Lab USA',               exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'ASML',  name: 'ASML Holding',                 exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'META',  name: 'Meta Platforms',               exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'EQIX',  name: 'Equinix Inc.',                 exchange: 'NASDAQ',  currency: '$', isPrivate: false },
  { ticker: 'TCEHY', name: 'Tencent Holdings',             exchange: 'OTC',     currency: '$', isPrivate: false },
  { ticker: 'SPCE',  name: 'SpaceX (estimativa IPO 2026)', exchange: 'PRIVADA', currency: '$', isPrivate: true },
]

// ─────────────────────────────────────────────────────────────
// FMP HELPERS
// ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Devolve o primeiro elemento (perfil/rácios/key-metrics vêm como array de 1)
async function fmpGetFirst<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    const { data } = await axios.get(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    if (!data) return null
    if (data && (data as any)['Error Message']) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T
    return data as T
  } catch {
    return null
  }
}

// Devolve o array completo (histórico de cotações)
async function fmpGetArray<T = any>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  try {
    const { data } = await axios.get(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 20000
    })
    if (Array.isArray(data)) return data as T[]
    return []
  } catch {
    return []
  }
}

function ymd(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────
// FETCH POR AÇÃO
// ─────────────────────────────────────────────────────────────

async function fetchPublicStock(ticker: string) {
  const profile = await fmpGetFirst('/profile', { symbol: ticker });        await sleep(200)
  const ratios  = await fmpGetFirst('/ratios-ttm', { symbol: ticker });     await sleep(200)
  const metrics = await fmpGetFirst('/key-metrics-ttm', { symbol: ticker }); await sleep(200)

  const from = new Date()
  from.setFullYear(from.getFullYear() - HISTORY_YEARS)
  const historical = await fmpGetArray('/historical-price-eod/light', {
    symbol: ticker,
    from: ymd(from),
    to: ymd(new Date())
  })
  await sleep(200)

  return {
    profile:    profile ?? {},
    ratios:     ratios ?? {},
    keyMetrics: metrics ?? {},
    historical,
    updated:    new Date().toISOString()
  }
}

function privateStockPayload() {
  return {
    profile: {
      price: null,
      changesPercentage: null,
      changePercentage: null,
      sector: 'Privada',
      country: '—'
    },
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

  console.log(`📈 [ClarezaTop10] Iniciando refresh de ${WATCHLIST.length} ações...`)

  let errors = 0

  const entries = await runWithConcurrency(
    WATCHLIST.map(stock => async () => {
      if (stock.isPrivate) {
        return { ticker: stock.ticker, payload: privateStockPayload() }
      }
      try {
        const payload = await fetchPublicStock(stock.ticker)
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
