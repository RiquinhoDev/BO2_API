import logger from '../../utils/logger'
import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import ClarezaTop10Data from '../../models/ClarezaTop10Data'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import {
  hasProviderError,
  isRecord,
  type ClarezaHistoricalPoint,
  type ClarezaTop10Payload,
  type ClarezaTop10StockPayload,
} from '../../types/clareza.types'

// Limita concorrência sem depender de p-queue (ESM-only)
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

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
// String JSON já serializada — servida diretamente ao HTML sem JSON.parse/stringify por request.
export const CLAREZA_TOP10_JSON_KEY = 'clareza:top10-data:json'
// 25h: cobre a maior janela entre refreshes do cron (18h→6h = 12h) com folga.
// O cron (6h/12h/18h) reescreve a chave 3×/dia, por isso o Redis nunca expira
// entre refreshes e o GET é sempre um hit rápido (sem fallback ao MongoDB).
const CACHE_TTL = 90000
const HISTORY_YEARS = 5 // histórico máximo por ação
const REVISION = 'Q2 2026'
const SPACEX_IPO_DATE = '2026-06-12'
const SPACEX_IPO_PRICE = 135
const SPACEX_FIRST_CLOSE = 160.95
const SPACEX_FIRST_DAY_CHANGE = Number((((SPACEX_FIRST_CLOSE - SPACEX_IPO_PRICE) / SPACEX_IPO_PRICE) * 100).toFixed(2))
const SPACEX_MARKET_CAP = 2110000000000

// ─────────────────────────────────────────────────────────────
// WATCHLIST Q2 2026 — Top 10 ações da equipa (alinhado com o HTML/PHP)
// Pedro: MU, GOOGL, TSM, NVDA, PLTR
// Rui:   ASML, META, RACE (Ferrari), NBIS (Nebius), SPCX (SpaceX)
// SpaceX: ainda sem dados FMP úteis → usa fallback manual de IPO.
//
// ASML e Ferrari passam a ser pedidas à FMP pela listagem nativa (Euronext
// Amsterdam / Borsa Italiana, em EUR) via `fetchTicker`, mas continuam
// guardadas na cache sob a chave "ASML"/"RACE" (campo `ticker`) — é essa a
// chave que o HTML já espera primeiro (tem alias RACE↔FERRARI como
// fallback, mas usar a mesma chave evita depender dele).
// ─────────────────────────────────────────────────────────────

const WATCHLIST = [
  { ticker: 'MU',    name: 'Micron Technology',        exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'GOOGL', name: 'Alphabet Inc.',            exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'TSM',   name: 'Taiwan Semiconductor',     exchange: 'NYSE',              currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'NVDA',  name: 'Nvidia Corporation',       exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'PLTR',  name: 'Palantir Technologies',    exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'ASML',  name: 'ASML Holding',             exchange: 'Euronext Amsterdam', currency: '€', isPrivate: false, ipoFallback: false, fetchTicker: 'ASML.AS' },
  { ticker: 'META',  name: 'Meta Platforms',           exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'RACE',  name: 'Ferrari NV',               exchange: 'Borsa Italiana',     currency: '€', isPrivate: false, ipoFallback: false, fetchTicker: 'RACE.MI' },
  { ticker: 'NBIS',  name: 'Nebius Group N.V.',        exchange: 'NASDAQ',            currency: '$', isPrivate: false, ipoFallback: false },
  { ticker: 'SPCX',  name: 'SpaceX',                   exchange: 'NASDAQ',             currency: '$', isPrivate: false, ipoFallback: true },
]

// ─────────────────────────────────────────────────────────────
// FMP HELPERS (stable + fallback v3)
// ─────────────────────────────────────────────────────────────

const isEmpty = (value: unknown) => value === null || value === undefined ||
  (isRecord(value) && Object.keys(value).length === 0)

function getFmpApiKey(): string {
  const integration = getRuntimeConfig().integrations.fmp
  if (!integration.configured) throw new IntegrationUnavailableError('fmp')
  return integration.value.apiKey
}

function firstProviderRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null
  }
  return isRecord(value) ? value : null
}

// Primeiro elemento — endpoints STABLE (?symbol=)
async function fmpFirstStable(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown> | null> {
  const apiKey = getFmpApiKey()
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_STABLE}${path}`, {
      params: { apikey: apiKey, ...params },
      timeout: 15000
    })
    if (!data || hasProviderError(data)) return null
    return firstProviderRecord(data)
  } catch {
    return null
  }
}

// Primeiro elemento — endpoints v3 (ticker no path)
async function fmpFirstV3(pathWithTicker: string): Promise<Record<string, unknown> | null> {
  const apiKey = getFmpApiKey()
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_V3}${pathWithTicker}`, {
      params: { apikey: apiKey },
      timeout: 15000
    })
    if (!data || hasProviderError(data)) return null
    return firstProviderRecord(data)
  } catch {
    return null
  }
}

function ymd(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Reduz a série histórica mantendo fidelidade visual do gráfico:
// diário nos últimos RECENT_DAYS, ~semanal antes disso. Garante 1º e último ponto.
// Corta o payload de ~1256 pts/ação para ~150 → JSON ~5× menor.
const RECENT_DAYS = 90
const OLD_STRIDE = 5 // 1 ponto a cada ~5 dias úteis (≈ semanal) para histórico antigo
function downsampleHistory(rows: ClarezaHistoricalPoint[]): ClarezaHistoricalPoint[] {
  if (rows.length <= 160) return rows
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS)
  const cutoffStr = ymd(cutoff)

  const out: ClarezaHistoricalPoint[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isRecent = row.date >= cutoffStr
    if (isRecent || i % OLD_STRIDE === 0) out.push(row)
  }
  // Garantir que o último ponto real (preço atual) está sempre presente
  const last = rows[rows.length - 1]
  if (out[out.length - 1]?.date !== last.date) out.push(last)
  return out
}

// Histórico: STABLE light → fallback v3 historical-price-full → normalizado {date, close}
async function fetchHistorical(ticker: string, from: string, to: string): Promise<ClarezaHistoricalPoint[]> {
  const apiKey = getFmpApiKey()
  let rows: unknown[] = []
  try {
    await fmpThrottle()
    const { data } = await axios.get<unknown>(`${FMP_STABLE}/historical-price-eod/light`, {
      params: { apikey: apiKey, symbol: ticker, from, to },
      timeout: 20000
    })
    if (Array.isArray(data)) rows = data
  } catch { /* ignora */ }

  if (!rows.length) {
    try {
      await fmpThrottle()
      const { data } = await axios.get<unknown>(`${FMP_V3}/historical-price-full/${ticker}`, {
        params: { apikey: apiKey, from, to },
        timeout: 20000
      })
      if (isRecord(data) && Array.isArray(data.historical)) rows = data.historical
    } catch { /* ignora */ }
  }

  const out: ClarezaHistoricalPoint[] = []
  for (const rawRow of rows) {
    if (!isRecord(rawRow)) continue
    const date = rawRow.date ?? null
    const close = rawRow.price ?? rawRow.close ?? rawRow.adjClose ?? null
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

async function fetchPublicStock(ticker: string): Promise<ClarezaTop10StockPayload> {
  // Sleeps manuais removidos: o fmpThrottle já é o único gate de ritmo
  // partilhado por toda a Clareza (2.400/min, plano Ultimate).
  // 1) STABLE
  let profile = await fmpFirstStable('/profile', { symbol: ticker })
  let ratios = await fmpFirstStable('/ratios-ttm', { symbol: ticker })
  let metrics = await fmpFirstStable('/key-metrics-ttm', { symbol: ticker })

  // 2) Fallback v3 quando a STABLE devolve vazio (ex.: NBIS, RACE)
  if (isEmpty(profile)) profile = await fmpFirstV3(`/profile/${ticker}`)
  if (isEmpty(ratios)) ratios = await fmpFirstV3(`/ratios-ttm/${ticker}`)
  if (isEmpty(metrics)) metrics = await fmpFirstV3(`/key-metrics-ttm/${ticker}`)

  const from = new Date()
  from.setFullYear(from.getFullYear() - HISTORY_YEARS)
  const historical = downsampleHistory(await fetchHistorical(ticker, ymd(from), ymd(new Date())))

  return {
    profile: profile ?? {},
    ratios: ratios ?? {},
    keyMetrics: metrics ?? {},
    historical,
    updated: new Date().toISOString()
  }
}

// SpaceX antes de IPO — dados manuais enquanto a FMP não devolve nada útil
function spacexIpoFallbackPayload(): ClarezaTop10StockPayload {
  const today = ymd(new Date())
  return {
    profile: {
      symbol: 'SPCX',
      price: SPACEX_FIRST_CLOSE,
      changesPercentage: SPACEX_FIRST_DAY_CHANGE,
      changePercentage: SPACEX_FIRST_DAY_CHANGE,
      marketCap: SPACEX_MARKET_CAP,
      companyName: 'SpaceX',
      currency: 'USD',
      exchangeFullName: 'NASDAQ',
      exchange: 'NASDAQ',
      industry: 'Aerospace & Defense',
      sector: 'Industrials',
      country: 'US',
      image: 'https://lp.serriquinho.com/wp-content/uploads/2026/06/SpaceX_logo_PNG3.png',
      description: 'SpaceX designs, manufactures and launches advanced rockets and spacecraft, and operates Starlink, a satellite internet constellation.',
      ipoDate: SPACEX_IPO_DATE,
      isActivelyTrading: true
    },
    ratios: {},
    keyMetrics: { marketCap: SPACEX_MARKET_CAP },
    historical: [
      { date: SPACEX_IPO_DATE, close: SPACEX_IPO_PRICE },
      { date: today, close: SPACEX_FIRST_CLOSE }
    ],
    ipoInfo: {
      ipoPrice: SPACEX_IPO_PRICE,
      firstClose: SPACEX_FIRST_CLOSE,
      listingDate: SPACEX_IPO_DATE,
      valuation: SPACEX_MARKET_CAP,
      tickerSymbol: 'SPCX',
      exchange: 'NASDAQ',
      status: 'live-fallback'
    },
    updated: new Date().toISOString()
  }
}

function withSpacexIpoFallback(payload: ClarezaTop10StockPayload): ClarezaTop10StockPayload {
  const fallback = spacexIpoFallbackPayload()
  const liveProfile = payload.profile
  const liveRatios = payload.ratios
  const liveKeyMetrics = payload.keyMetrics
  const liveHistorical = payload.historical

  const livePrice = liveProfile.price
  const hasPrice = livePrice !== null && livePrice !== undefined && !isNaN(Number(livePrice))
  const hasHistory = liveHistorical.length >= 2
  const liveChange = liveProfile.changesPercentage ?? liveProfile.changePercentage

  return {
    ...fallback,
    ...payload,
    profile: {
      ...fallback.profile,
      ...liveProfile,
      price: hasPrice ? Number(livePrice) : fallback.profile.price,
      changesPercentage: liveChange ?? fallback.profile.changesPercentage,
      changePercentage: liveChange ?? fallback.profile.changePercentage,
      marketCap: liveProfile.marketCap ?? fallback.profile.marketCap,
      isActivelyTrading: liveProfile.isActivelyTrading ?? fallback.profile.isActivelyTrading
    },
    ratios: isEmpty(liveRatios) ? fallback.ratios : liveRatios,
    keyMetrics: isEmpty(liveKeyMetrics) ? fallback.keyMetrics : liveKeyMetrics,
    historical: hasHistory ? liveHistorical : fallback.historical,
    ipoInfo: {
      ...fallback.ipoInfo,
      ...(payload.ipoInfo ?? {})
    },
    updated: payload.updated || fallback.updated
  }
}

function privateStockPayload(): ClarezaTop10StockPayload {
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
  getFmpApiKey()

  logger.info(`📈 [ClarezaTop10] Iniciando refresh de ${WATCHLIST.length} ações (${REVISION})...`)

  let errors = 0

  const entries = await runWithConcurrency(
    WATCHLIST.map(stock => async () => {
      if (stock.isPrivate) {
        return { ticker: stock.ticker, payload: privateStockPayload() }
      }
      try {
        let payload = await fetchPublicStock(stock.fetchTicker || stock.ticker)

        // SPCX: usa fallback manual de IPO enquanto a FMP não tiver preço nem histórico
        if (stock.ipoFallback) {
          payload = withSpacexIpoFallback(payload)
        }

        return { ticker: stock.ticker, payload }
      } catch (err: unknown) {
        errors++
        logger.error(`❌ [ClarezaTop10] Erro em ${stock.ticker}:`, errorMessage(err))
        return { ticker: stock.ticker, payload: null }
      }
    }),
    // 10 ações em simultâneo (a watchlist toda) — o fmpThrottle global já
    // garante que a soma de chamadas nunca passa de 2.400/min.
    10
  )

  const stocks: Record<string, ClarezaTop10StockPayload> = {}
  for (const entry of entries) {
    if (entry.payload) stocks[entry.ticker] = entry.payload
  }

  const payload: ClarezaTop10Payload = {
    updated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    source: 'Financial Modeling Prep',
    revision: REVISION,
    stocks
  }

  // Guardar em Redis: objeto (back-compat) + string já serializada (servida sem parse/stringify)
  const payloadJson = JSON.stringify(payload)
  await cacheService.set(CLAREZA_TOP10_CACHE_KEY, payload, CACHE_TTL)
  await cacheService.setRaw(CLAREZA_TOP10_JSON_KEY, payloadJson, CACHE_TTL)
  // Atualizar cache em memória do processo (rede de segurança independente do Redis)
  memJson = { value: payloadJson, expires: Date.now() + MEM_TTL_MS }

  // Guardar em MongoDB (persistência durável — mesmo se Redis reiniciar)
  try {
    await ClarezaTop10Data.create({
      fetchedAt: new Date(),
      stockCount: Object.keys(stocks).length,
      errors,
      payload
    })
    // Manter apenas os últimos 5 snapshots
    const all = await ClarezaTop10Data.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map((document) => document._id)
      await ClarezaTop10Data.deleteMany({ _id: { $in: toDelete } })
    }
    logger.info('💾 [ClarezaTop10] Snapshot guardado na BD')
  } catch (err: unknown) {
    logger.error('⚠️ [ClarezaTop10] Erro ao guardar snapshot na BD:', errorMessage(err))
  }

  logger.info(`✅ [ClarezaTop10] Refresh completo — ${Object.keys(stocks).length} ok, ${errors} erros`)

  return { total: WATCHLIST.length, errors }
}

// ─────────────────────────────────────────────────────────────
// GET COM CACHE (Redis → MongoDB → null)
// ─────────────────────────────────────────────────────────────

// Rede de segurança em memória do processo: garante <1s mesmo se o Redis estiver
// desligado/indisponível (evita re-ler Mongo + re-serializar a cada request).
// TTL curto; o cron (6/12/18h) e o refresh manual mantêm-no fresco.
let memJson: { value: string; expires: number } | null = null
const MEM_TTL_MS = 10 * 60 * 1000 // 10 min

// GET rápido: devolve a STRING JSON pronta a enviar (sem JSON.parse + res.json).
// É este o caminho usado pelo endpoint público /api/clareza/top10.
export async function getClarezaTop10Json(): Promise<string | null> {
  // 0. Memória do processo (mais rápido; independente do Redis)
  if (memJson && memJson.expires > Date.now()) return memJson.value

  // 1. Redis — string já serializada (caminho quente, ~ms)
  const rawJson = await cacheService.getRaw(CLAREZA_TOP10_JSON_KEY)
  if (rawJson) {
    memJson = { value: rawJson, expires: Date.now() + MEM_TTL_MS }
    return rawJson
  }

  // 2. Fallback: objeto em Redis/Mongo → serializa uma vez e re-popula as caches
  const obj = await getClarezaTop10Data()
  if (!obj) return null
  const json = JSON.stringify(obj)
  await cacheService.setRaw(CLAREZA_TOP10_JSON_KEY, json, CACHE_TTL)
  memJson = { value: json, expires: Date.now() + MEM_TTL_MS }
  return json
}

export async function getClarezaTop10Data(): Promise<ClarezaTop10Payload | null> {
  // 1. Tentar Redis
  const cached = await cacheService.get<ClarezaTop10Payload>(CLAREZA_TOP10_CACHE_KEY)
  if (cached) return cached

  // 2. Redis miss → tentar MongoDB (último snapshot persistido)
  try {
    const latest = await ClarezaTop10Data.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.payload?.stocks && Object.keys(latest.payload.stocks).length) {
      logger.info(`📦 [ClarezaTop10] Cache Redis vazio — a servir snapshot da BD (${latest.fetchedAt})`)
      await cacheService.set(CLAREZA_TOP10_CACHE_KEY, latest.payload, CACHE_TTL)
      return latest.payload
    }
  } catch (err: unknown) {
    logger.error('⚠️ [ClarezaTop10] Erro ao ler snapshot da BD:', errorMessage(err))
  }

  // 3. Nenhum dado disponível. Não chamar FMP em load público.
  logger.warn('[ClarezaTop10] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}
