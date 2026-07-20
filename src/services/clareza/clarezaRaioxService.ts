import axios from 'axios'
import { cacheService } from '../cache.service'
import { UNIVERSE } from './clarezaFmpService'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import ClarezaRaioxData from '../../models/ClarezaRaioxData'

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

const FMP_STABLE = 'https://financialmodelingprep.com/stable'

const RAIOX_CACHE_PREFIX = 'clareza:raiox:v1:'      // clareza:raiox:v1:AAPL → payload rico (objeto)
const RAIOX_JSON_PREFIX  = 'clareza:raiox:json:v1:' // resposta já serializada (payload + sectorPe) p/ servir raw
const RAIOX_INDEX_KEY    = 'clareza:raiox:index'    // [{symbol,name,price,image}] p/ pesquisa
const RAIOX_SECTORPE_KEY = 'clareza:raiox:sectorpe' // snapshot setorial (P/E médio)
const RAIOX_SPY_KEY      = 'clareza:raiox:spy'      // histórico SPY comprimido (momentum)

// 25h: cobre a maior janela entre refreshes do cron (18h→6h) com folga.
// O cron 6h/12h/18h reescreve as chaves 3×/dia → GET é sempre hit rápido.
const RAIOX_TTL = 90000

type JsonObject = Record<string, unknown>
type PricePoint = { d: string; c: number }

interface RaioxPayload extends JsonObject {
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

interface RaioxSnapshot {
  stocks?: Record<string, RaioxPayload>
  sectorPe?: unknown[]
}

interface RaioxSearchResult {
  query: string
  count: number
  results: RaioxIndexEntry[]
}

interface RaioxDiagnosis {
  tested: number
  ok: number
  failed: number
  results: Array<JsonObject & { ticker: string; ok: boolean }>
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectOrEmpty(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {}
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function errorMessage(error: unknown): string {
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const round2 = (n: number) => Math.round(n * 100) / 100

// Limita a concorrência (sem dependências externas).
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

// Todas as chamadas passam pelo limitador global partilhado (fmpThrottle),
// comum às 3 ferramentas Clareza → a soma nunca passa do limite do plano.
async function fmpRaw(path: string, params: Record<string, string> = {}): Promise<unknown> {
  if (!process.env.FMP_API_KEY) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    await fmpThrottle()
    try {
      const { data } = await axios.get<unknown>(`${FMP_STABLE}${path}`, {
        params: { apikey: process.env.FMP_API_KEY, ...params },
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

function fmpFirst(data: unknown): JsonObject | null {
  const first = Array.isArray(data) ? data[0] : data
  return isJsonObject(first) ? first : null
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function lastBday(): string {
  const d = new Date()
  do { d.setUTCDate(d.getUTCDate() - 1) } while ([0, 6].includes(d.getUTCDay()))
  return d.toISOString().slice(0, 10)
}

// Bucket semanal de 7 dias (downsample do histórico antigo)
function weekBucket(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  return String(Math.floor(t / (7 * 86400000)))
}

// Comprime histórico: diário nos últimos ~6 meses, semanal até 5 anos.
function compressHist(raw: unknown): PricePoint[] {
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
function calcMomentum(
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
async function gatherRaiox(ticker: string, concurrent: boolean): Promise<Record<string, unknown>> {
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

async function fetchCompanyRaiox(
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
async function pruneStaleRaiox(): Promise<void> {
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

export async function refreshClarezaRaioxData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  console.log(`📊 [Raiox] Iniciando refresh de ${RAIOX_UNIVERSE.length} ações...`)

  // 1. Dados globais (uma vez): P/E setorial + histórico SPY p/ momentum.
  const sectorPe = (await fmpRaw('/sector-pe-snapshot', { date: lastBday() })) ?? []
  const spyRaw   = await fmpRaw('/historical-price-eod/light', {
    symbol: 'SPY',
    from: isoDaysAgo(365 * 5),
    to: new Date().toISOString().slice(0, 10)
  })
  const spyHist = compressHist(spyRaw ?? [])

  await cacheService.set(RAIOX_SECTORPE_KEY, sectorPe, RAIOX_TTL)
  await cacheService.set(RAIOX_SPY_KEY, spyHist, RAIOX_TTL)

  // 2. Empresas — sequencial (o gate global trata do ritmo).
  let errors = 0
  const index: Array<{
    symbol: string; name: string; price: unknown; image: unknown
    currency: unknown; exchange: unknown; country: unknown
  }> = []
  const snapshot: Record<string, RaioxPayload> = {}

  for (const stock of RAIOX_UNIVERSE) {
    try {
      const data = await fetchCompanyRaiox(stock.ticker, spyHist)
      if (data) {
        await cacheService.set(RAIOX_CACHE_PREFIX + stock.ticker, data, RAIOX_TTL)
        // String já serializada (com sectorPe embutido) → GET serve raw, sem stringify por pedido.
        await cacheService.setRaw(RAIOX_JSON_PREFIX + stock.ticker, JSON.stringify({ ...data, sectorPe }), RAIOX_TTL)
        snapshot[stock.ticker] = data
        index.push({
          symbol:   stock.ticker,
          name:     String(data.p.companyName ?? data.p.name ?? stock.name),
          price:    data.p?.price ?? null,
          image:    data.p?.image ?? null,
          currency: data.p?.currency ?? null,
          exchange: data.p?.exchangeShortName ?? data.p?.exchange ?? null,
          country:  data.p?.country ?? null
        })
      } else {
        errors++
        console.warn(`⚠️ [Raiox] Sem dados para ${stock.ticker}`)
      }
    } catch (error: unknown) {
      errors++
      console.error(`❌ [Raiox] Erro em ${stock.ticker}:`, errorMessage(error))
    }
  }

  await cacheService.set(RAIOX_INDEX_KEY, index, RAIOX_TTL)

  // 2.5 Remove do Redis tickers que já não estão no universo (ex.: troca de
  // cotação como RACE → RACE.MI) — sem isto ficavam servidos em cache até
  // expirar o TTL (~25h), mesmo já não fazendo parte da lista curada.
  await pruneStaleRaiox()

  // 3. Snapshot durável em MongoDB (sobrevive a reinício do Redis).
  try {
    await ClarezaRaioxData.create({
      fetchedAt:  new Date(),
      stockCount: RAIOX_UNIVERSE.length - errors,
      errors,
      sectorPe,
      stocks: snapshot
    })
    const all = await ClarezaRaioxData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map(document => document._id)
      await ClarezaRaioxData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log('💾 [Raiox] Snapshot guardado na BD')
  } catch (error: unknown) {
    console.error('⚠️ [Raiox] Erro ao guardar snapshot na BD:', errorMessage(error))
  }

  console.log(`✅ [Raiox] Refresh completo — ${RAIOX_UNIVERSE.length - errors} ok, ${errors} erros`)
  return { total: RAIOX_UNIVERSE.length, errors }
}

// ─────────────────────────────────────────────────────────────
// GET POR TICKER (Redis → MongoDB → FMP live)
// ─────────────────────────────────────────────────────────────

async function getSectorPe(): Promise<unknown[]> {
  const cached = await cacheService.get<unknown[]>(RAIOX_SECTORPE_KEY)
  if (cached && cached.length) return cached

  // Cache vazia (ainda sem cron, ou ticker on-demand) → busca lazy + cacheia.
  const snapshot = (await fmpRaw('/sector-pe-snapshot', { date: lastBday() })) ?? []
  if (Array.isArray(snapshot) && snapshot.length) {
    await cacheService.set(RAIOX_SECTORPE_KEY, snapshot, RAIOX_TTL)
    return snapshot
  }
  return cached ?? []
}

export async function getRaioxAnalysis(rawTicker: string): Promise<RaioxPayload & { sectorPe: unknown[] }> {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  // 1. Redis (caminho normal — pré-aquecido pelo cron).
  const cached = await cacheService.get<RaioxPayload>(RAIOX_CACHE_PREFIX + ticker)
  if (cached) return { ...cached, sectorPe: await getSectorPe() }

  // 2. Redis miss → snapshot MongoDB do último refresh.
  // Projeta SÓ a empresa pedida + sectorPe (o snapshot tem ~180 empresas/vários
  // MB; ler o doc inteiro por request seria lento). Ticker já validado acima.
  try {
    const latest = await ClarezaRaioxData
      .findOne({}, { [`stocks.${ticker}`]: 1, sectorPe: 1, fetchedAt: 1 })
      .sort({ fetchedAt: -1 })
      .lean<RaioxSnapshot | null>()
    const hit = latest?.stocks?.[ticker]
    if (hit) {
      await cacheService.set(RAIOX_CACHE_PREFIX + ticker, hit, RAIOX_TTL)
      return { ...hit, sectorPe: latest?.sectorPe ?? [] }
    }
  } catch (error: unknown) {
    console.error('⚠️ [Raiox] Erro ao ler snapshot da BD:', errorMessage(error))
  }

  // 3. Fora da cache (ticker raro / fora do universo) → fetch live + cacheia.
  let spyHist = await cacheService.get<{ d: string; c: number }[]>(RAIOX_SPY_KEY)
  if (!spyHist || !spyHist.length) {
    const spyRaw = await fmpRaw('/historical-price-eod/light', {
      symbol: 'SPY',
      from: isoDaysAgo(365 * 5),
      to: new Date().toISOString().slice(0, 10)
    })
    spyHist = compressHist(spyRaw ?? [])
    if (spyHist.length) await cacheService.set(RAIOX_SPY_KEY, spyHist, RAIOX_TTL)
  }

  // Pesquisa on-demand de UMA empresa → chamadas em paralelo (sem gate) ≈ ~1s.
  const data = await fetchCompanyRaiox(ticker, spyHist ?? [], true)
  if (!data) throw new Error('Ticker nao encontrado')

  await cacheService.set(RAIOX_CACHE_PREFIX + ticker, data, RAIOX_TTL)
  return { ...data, sectorPe: await getSectorPe() }
}

// Variante que devolve a resposta JÁ serializada (string), para o endpoint
// servir raw (res.send) — sem JSON.parse/stringify por pedido no caminho comum.
// Caminho comum (universo pré-aquecido): getRaw → devolve a string direto.
export async function getRaioxJson(rawTicker: string): Promise<string> {
  const ticker = normalizeTicker(rawTicker)
  if (!isValidTicker(ticker)) throw new Error('Ticker invalido')

  const raw = await cacheService.getRaw(RAIOX_JSON_PREFIX + ticker)
  if (raw) return raw

  // Miss → reconstrói pelo caminho objeto (Redis → Mongo → live) e guarda a string.
  const obj = await getRaioxAnalysis(ticker)
  const json = JSON.stringify(obj)
  await cacheService.setRaw(RAIOX_JSON_PREFIX + ticker, json, RAIOX_TTL)
  return json
}

// ─────────────────────────────────────────────────────────────
// PESQUISA / AUTOCOMPLETE (só a partir da cache, sem chamar FMP)
// ─────────────────────────────────────────────────────────────

type RaioxIndexEntry = {
  symbol: string; name: string; price: unknown; image: unknown
  currency?: unknown; exchange?: unknown; country?: unknown
}

export async function searchRaiox(rawQuery: string): Promise<RaioxSearchResult> {
  const q = String(rawQuery || '').trim().toUpperCase()

  let index = await cacheService.get<RaioxIndexEntry[]>(RAIOX_INDEX_KEY)

  // Fallback: reconstruir índice mínimo a partir do universo estático.
  if (!index || !index.length) {
    index = RAIOX_UNIVERSE.map(s => ({
      symbol: s.ticker, name: s.name, price: null, image: null,
      currency: null, exchange: null, country: null
    }))
  }

  // Relevância: 0 = ticker exacto, 1 = ticker começa por, 2 = nome começa por, 3 = contém.
  const ranked = index
    .map(item => {
      const symbolUp = item.symbol.toUpperCase()
      const nameUp = String(item.name || '').toUpperCase()
      let rank: number | null = null
      if (q === '') rank = 3
      else if (symbolUp === q) rank = 0
      else if (symbolUp.startsWith(q)) rank = 1
      else if (nameUp.startsWith(q)) rank = 2
      else if (symbolUp.includes(q) || nameUp.includes(q)) rank = 3
      return rank === null ? null : { item, rank }
    })
    .filter((x): x is { item: RaioxIndexEntry; rank: number } => x !== null)
    .sort((a, b) => a.rank - b.rank || a.item.symbol.localeCompare(b.item.symbol))
    .map(x => x.item)

  return { query: q, count: ranked.length, results: ranked.slice(0, 25) }
}

// ─────────────────────────────────────────────────────────────
// DIAGNÓSTICO (equivalente ao ?diagnose=1 do PHP)
//
// Testa os tickers internacionais novos diretamente contra a FMP, um a um
// e devagar, SEM tocar na cache principal (Redis/Mongo) nem no índice de
// pesquisa. Serve só para confirmar que o plano FMP devolve dados para
// cada bolsa antes de confiarmos neles no refresh completo.
// ─────────────────────────────────────────────────────────────

const DIAGNOSE_TICKERS = [
  '2330.TW', 'ASML.AS',
  'NESN.SW', 'TCEHY', 'BABA', 'SIE.DE', 'MC.PA', 'ARM',
  '005930.KS', '000660.KS', 'SAB.MC', 'SAP.DE', 'RACE.MI', 'SAF.PA', 'RHM.DE', 'DG.PA',
  'NOVO-B.CO'
]

export async function diagnoseRaiox(): Promise<RaioxDiagnosis> {
  if (!process.env.FMP_API_KEY) throw new Error('FMP_API_KEY nao configurada')

  const results: Array<JsonObject & { ticker: string; ok: boolean }> = []

  for (const t of DIAGNOSE_TICKERS) {
    let p = fmpFirst(await fmpRaw('/profile', { symbol: t }))
    if (!p) p = fmpFirst(await fmpRaw('/quote', { symbol: t }))

    if (p) {
      results.push({
        ticker: t,
        ok: true,
        name: p.companyName ?? p.name ?? null,
        price: p.price ?? null,
        currency: p.currency ?? null,
        exchange: p.exchangeShortName ?? p.exchange ?? null,
        country: p.country ?? null
      })
    } else {
      results.push({ ticker: t, ok: false, error: 'Sem resposta da FMP para este símbolo.' })
    }

    // Ritmo deliberadamente lento — isto é um diagnóstico manual, não o
    // refresh do cron, não há pressa e evita bursts que pareçam abuso.
    await sleep(300)
  }

  const failed = results.filter(r => !r.ok)
  return {
    tested: results.length,
    ok: results.length - failed.length,
    failed: failed.length,
    results
  }
}
