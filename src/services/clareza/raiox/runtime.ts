import logger from '../../../utils/logger'
import { cacheService } from '../../cache.service'
import ClarezaRaioxData from '../../../models/ClarezaRaioxData'
import { getFmpApiKey } from '../../requestDrivenRuntimeConfig'
import { normalizeTicker, isValidTicker } from '../tickerUtils'
import {
  compressHist,
  errorMessage,
  fetchCompanyRaiox,
  fmpFirst,
  fmpRaw,
  isoDaysAgo,
  JsonObject,
  lastBday,
  pruneStaleRaiox,
  RAIOX_CACHE_PREFIX,
  RAIOX_INDEX_KEY,
  RAIOX_JSON_PREFIX,
  RaioxDiagnosis,
  RaioxPayload,
  RaioxSearchResult,
  RaioxSnapshot,
  RAIOX_SECTORPE_KEY,
  RAIOX_SPY_KEY,
  RAIOX_TTL,
  RAIOX_UNIVERSE,
  sleep
} from './data'
export async function refreshClarezaRaioxData(): Promise<{ total: number; errors: number }> {
  getFmpApiKey()

  logger.info(`📊 [Raiox] Iniciando refresh de ${RAIOX_UNIVERSE.length} ações...`)

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
        logger.warn(`⚠️ [Raiox] Sem dados para ${stock.ticker}`)
      }
    } catch (error: unknown) {
      errors++
      logger.error(`❌ [Raiox] Erro em ${stock.ticker}:`, errorMessage(error))
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
    logger.info('💾 [Raiox] Snapshot guardado na BD')
  } catch (error: unknown) {
    logger.error('⚠️ [Raiox] Erro ao guardar snapshot na BD:', errorMessage(error))
  }

  logger.info(`✅ [Raiox] Refresh completo — ${RAIOX_UNIVERSE.length - errors} ok, ${errors} erros`)
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
  getFmpApiKey()

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
    logger.error('⚠️ [Raiox] Erro ao ler snapshot da BD:', errorMessage(error))
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
  getFmpApiKey()

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
