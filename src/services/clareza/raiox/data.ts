import axios from 'axios'
import { cacheService } from '../../cache.service'
import { UNIVERSE } from '../clarezaFmpService'
import { fmpThrottle } from '../fmpThrottle'
import { normalizeTicker, isValidTicker } from '../tickerUtils'
import { getFmpApiKey, getOptionalFmpApiKey } from '../../requestDrivenRuntimeConfig'

// ─────────────────────────────────────────────────────────────
// RAIO-X DA AÇÃO — versão Node (migrada do clareza-raiox.php)
//
// Comportamento igual ao Tremómetro/Top10:
//  • o cron pré-aquece TODO o universo no Redis (uma chave por ticker)
//  • o frontend lê sempre da cache → carregamento instantâneo
//  • fallback: Redis → MongoDB (snapshot) → FMP live (on-demand)
//
// Plano FMP base (limite por minuto) → todas as chamadas passam por um
// "gate" global que garante ~4 req/s (240/min) com retry a 429.
// ─────────────────────────────────────────────────────────────

export const FMP_STABLE = 'https://financialmodelingprep.com/stable'

export const RAIOX_CACHE_PREFIX = 'clareza:raiox:v1:'      // clareza:raiox:v1:AAPL → payload rico (objeto)
export const RAIOX_JSON_PREFIX  = 'clareza:raiox:json:v1:' // resposta já serializada (payload + sectorPe) p/ servir raw
export const RAIOX_INDEX_KEY    = 'clareza:raiox:index'    // [{symbol,name,price,image}] p/ pesquisa
export const RAIOX_SECTORPE_KEY = 'clareza:raiox:sectorpe' // snapshot setorial (P/E médio)
export const RAIOX_SPY_KEY      = 'clareza:raiox:spy'      // histórico SPY comprimido (momentum)

// 25h: cobre a maior janela entre refreshes do cron (18h→6h) com folga.
// O cron 6h/12h/18h reescreve as chaves 3×/dia → GET é sempre hit rápido.
export const RAIOX_TTL = 90000

export type JsonObject = Record<string, unknown>
export type PricePoint = { d: string; c: number }

export interface RaioxPayload extends JsonObject {
  p: JsonObject
  r: JsonObject
  km: JsonObject
  inc: unknown[]
  cf: unknown[]
  ra: unknown[]
  gr: JsonObject
  pt: JsonObject
  ea: unknown[]
  dv: unknown[]
  dcf: JsonObject
  pr: Record<string, { g: unknown; n: unknown }>
  mo: Record<string, { s: number | null; x: number | null }> | null
}

export interface RaioxSnapshot {
  stocks?: Record<string, RaioxPayload>
  sectorPe?: unknown[]
}

export type RaioxIndexEntry = {
  symbol: string; name: string; price: unknown; image: unknown
  currency?: unknown; exchange?: unknown; country?: unknown
}

export interface RaioxSearchResult {
  query: string
  count: number
  results: RaioxIndexEntry[]
}

export interface RaioxDiagnosis {
  tested: number
  ok: number
  failed: number
  results: Array<JsonObject & { ticker: string; ok: boolean }>
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function objectOrEmpty(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {}
}

export function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Universo do raiox = universo base do Clareza (já inclui os internacionais:
// 2330.TW, ASML.AS, RACE.MI, etc.) + extras só do raiox.
const RAIOX_EXTRAS = [
  { ticker: 'NBIS', name: 'Nebius Group', type: 'growth', sector: 'Technology' },
  { ticker: 'SPCX', name: 'SpaceX',       type: 'growth', sector: 'Industrials' },
]

export const RAIOX_UNIVERSE = (() => {
  const seen = new Set(UNIVERSE.map(s => s.ticker))
  return [...UNIVERSE, ...RAIOX_EXTRAS.filter(e => !seen.has(e.ticker))]
})()

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const round2 = (n: number) => Math.round(n * 100) / 100

// Limita a concorrência (sem dependências externas).
export async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
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

// Todas as chamadas passam pelo limitador global partilhado (fmpThrottle),
// comum às 3 ferramentas Clareza → a soma nunca passa do limite do plano.
export async function fmpRaw(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = getOptionalFmpApiKey()
  if (!apiKey) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    await fmpThrottle()
    try {
      const { data } = await axios.get<unknown>(`${FMP_STABLE}${path}`, {
        params: { apikey: apiKey, ...params },
        timeout: 15000
      })
      if (!data) return null
      if (isJsonObject(data) && data['Error Message']) return null
      return data
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 429 && attempt < 2) {
        await sleep(2000) // rate limit → espera e tenta de novo
        continue
      }
      return null
    }
  }
  return null
}

export function fmpFirst(data: unknown): JsonObject | null {
  const first = Array.isArray(data) ? data[0] : data
  return isJsonObject(first) ? first : null
}

export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function lastBday(): string {
  const d = new Date()
  do { d.setUTCDate(d.getUTCDate() - 1) } while ([0, 6].includes(d.getUTCDay()))
  return d.toISOString().slice(0, 10)
}

// Bucket semanal de 7 dias (downsample do histórico antigo)
export function weekBucket(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  return String(Math.floor(t / (7 * 86400000)))
}

// Comprime histórico: diário nos últimos ~6 meses, semanal até 5 anos.
export function compressHist(raw: unknown): PricePoint[] {
  if (!Array.isArray(raw)) return []
  const rows = raw.filter(isJsonObject)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const cutoffDaily  = isoDaysAgo(182)
  const cutoffWeekly = isoDaysAgo(365 * 5)
  const out: PricePoint[] = []
  let lastWeek: string | null = null

  for (const row of rows) {
    const date = String(row.date || '').slice(0, 10)
    const closeRaw = row.price ?? row.close ?? row.adjClose ?? null
    if (!date || closeRaw === null || isNaN(Number(closeRaw))) continue
    const close = round2(Number(closeRaw))
    if (date < cutoffWeekly) continue

    if (date >= cutoffDaily) {
      out.push({ d: date, c: close })
    } else {
      const wk = weekBucket(date)
      if (wk !== lastWeek) {
        out.push({ d: date, c: close })
        lastWeek = wk
      }
    }
  }
  return out
}

// Variações de momentum (empresa vs SPY) para períodos fixos.
export function calcMomentum(
  stockHist: { d: string; c: number }[],
  spyHist: { d: string; c: number }[]
): Record<string, { s: number | null; x: number | null }> | null {
  const periods: Record<string, number> = { '1M': 30, '3M': 90, '6M': 182, '1Y': 365, '3Y': 1095, '5Y': 1825 }
  const s = [...stockHist].sort((a, b) => a.d.localeCompare(b.d))
  const x = [...spyHist].sort((a, b) => a.d.localeCompare(b.d))
  if (!s.length || !x.length) return null

  const stockNow = Number(s[s.length - 1].c)
  const spyNow   = Number(x[x.length - 1].c)
  const result: Record<string, { s: number | null; x: number | null }> = {}

  for (const [label, days] of Object.entries(periods)) {
    const cutoff = isoDaysAgo(days)

    let stockThen: number | null = null
    for (const r of s) { if (r.d <= cutoff) stockThen = Number(r.c); else break }
    if (stockThen === null && s.length) stockThen = Number(s[0].c)

    let spyThen: number | null = null
    for (const r of x) { if (r.d <= cutoff) spyThen = Number(r.c); else break }
    if (spyThen === null && x.length) spyThen = Number(x[0].c)

    const sPct = stockThen && stockNow ? round2(((stockNow - stockThen) / stockThen) * 100) : null
    const xPct = spyThen && spyNow ? round2(((spyNow - spyThen) / spyThen) * 100) : null
    result[label] = { s: sPct, x: xPct }
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// FETCH RICO POR EMPRESA (espelha fetch_company do PHP)
// Devolve o payload com chaves curtas que o HTML do raiox já consome.
// ─────────────────────────────────────────────────────────────

// Recolhe as chamadas independentes (não dependem do resultado umas das outras).
// concurrent=true → todas em paralelo, sem gate (pesquisa on-demand, ~1s).
// concurrent=false → em série pelo gate global (cron, respeita 300/min).
export async function gatherRaiox(ticker: string, concurrent: boolean): Promise<Record<string, unknown>> {
  const from = isoDaysAgo(365 * 5)
  const to   = new Date().toISOString().slice(0, 10)
  const reqs: Record<string, [string, Record<string, string>]> = {
    profile: ['/profile', { symbol: ticker }],
    r:       ['/ratios-ttm', { symbol: ticker }],
    km:      ['/key-metrics-ttm', { symbol: ticker }],
    inc:     ['/income-statement', { symbol: ticker, period: 'annual', limit: '8' }],
    cf:      ['/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '8' }],
    ra:      ['/ratios', { symbol: ticker, period: 'annual', limit: '8' }],
    gr:      ['/grades-consensus', { symbol: ticker }],
    pt:      ['/price-target-consensus', { symbol: ticker }],
    ea:      ['/earnings', { symbol: ticker, limit: '8' }],
    dv:      ['/dividends', { symbol: ticker, limit: '60' }],
    dcf:     ['/levered-discounted-cash-flow', { symbol: ticker }],
    peers:   ['/stock-peers', { symbol: ticker }],
    hist:    ['/historical-price-eod/light', { symbol: ticker, from, to }]
  }

  const entries = Object.entries(reqs)
  const raw: Record<string, unknown> = {}
  if (concurrent) {
    // On-demand: até 5 em simultâneo — o burst do bucket serve-as logo se há folga.
    const vals = await runWithConcurrency(entries.map(([, [p, q]]) => () => fmpRaw(p, q)), 5)
    entries.forEach(([k], i) => { raw[k] = vals[i] })
  } else {
    for (const [k, [p, q]] of entries) raw[k] = await fmpRaw(p, q)
  }
  return raw
}

export async function fetchCompanyRaiox(
  ticker: string,
  spyHist: { d: string; c: number }[],
  concurrent = false
): Promise<RaioxPayload | null> {
  const raw = await gatherRaiox(ticker, concurrent)

  let profile = fmpFirst(raw.profile)
  if (!profile) profile = fmpFirst(await fmpRaw('/quote', { symbol: ticker }))
  if (!profile) return null

  let dcf = fmpFirst(raw.dcf)
  if (!dcf) dcf = fmpFirst(await fmpRaw('/discounted-cash-flow', { symbol: ticker }))

  // Peers leves (até 3) — depende da lista vinda do /stock-peers.
  let peerList: string[] = []
  if (Array.isArray(raw.peers) && raw.peers.length) {
    const firstPeer = isJsonObject(raw.peers[0]) ? raw.peers[0] : null
    const listedPeers = firstPeer && Array.isArray(firstPeer.peersList)
      ? firstPeer.peersList.filter((peer): peer is string => typeof peer === 'string')
      : raw.peers
        .filter(isJsonObject)
        .map(peer => peer.symbol)
        .filter((symbol): symbol is string => typeof symbol === 'string')
    peerList = listedPeers.filter(peer => peer && peer !== ticker).slice(0, 3)
  }

  const peerRatios: Record<string, { g: unknown; n: unknown }> = {}
  const assignPeer = (peer: string, ratios: JsonObject | null) => {
    if (ratios) {
      peerRatios[peer] = {
        g: ratios.grossProfitMarginTTM ?? null,
        n: ratios.netProfitMarginTTM ?? null
      }
    }
  }
  if (peerList.length) {
    if (concurrent) {
      const prs = await Promise.all(peerList.map(p => fmpRaw('/ratios-ttm', { symbol: p })))
      peerList.forEach((p, i) => assignPeer(p, fmpFirst(prs[i])))
    } else {
      for (const p of peerList) assignPeer(p, fmpFirst(await fmpRaw('/ratios-ttm', { symbol: p })))
    }
  }

  const stockH = compressHist(raw.hist ?? [])
  const momentum = calcMomentum(stockH, spyHist ?? [])

  return {
    p:   profile,
    r:   objectOrEmpty(fmpFirst(raw.r)),
    km:  objectOrEmpty(fmpFirst(raw.km)),
    inc: arrayOrEmpty(raw.inc),
    cf:  arrayOrEmpty(raw.cf),
    ra:  arrayOrEmpty(raw.ra),
    gr:  objectOrEmpty(fmpFirst(raw.gr)),
    pt:  objectOrEmpty(fmpFirst(raw.pt)),
    ea:  arrayOrEmpty(raw.ea),
    dv:  arrayOrEmpty(raw.dv),
    dcf: objectOrEmpty(dcf),
    pr:  peerRatios,
    mo:  momentum
  }
}

// Apaga do Redis as chaves de tickers que já não estão em RAIOX_UNIVERSE
// (equivalente ao prune_stale_stocks do PHP). Corre sempre a seguir a um
// refresh completo, quando o universo já reflete a lista atual.
export async function pruneStaleRaiox(): Promise<void> {
  const valid = new Set(RAIOX_UNIVERSE.map(s => s.ticker))

  for (const prefix of [RAIOX_CACHE_PREFIX, RAIOX_JSON_PREFIX]) {
    const keys = await cacheService.keys(prefix + '*')
    for (const key of keys) {
      const ticker = key.slice(prefix.length)
      if (!valid.has(ticker)) {
        await cacheService.del(key)
        console.log(`🧹 [Raiox] Removido da cache (fora do universo): ${ticker}`)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// REFRESH COMPLETO (cron ClarezaRefresh + endpoint manual)
// ─────────────────────────────────────────────────────────────
