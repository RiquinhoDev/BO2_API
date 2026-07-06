import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import ClarezaEarningsData from '../../models/ClarezaEarningsData'

// Limits concurrency without adding p-queue to this hot path.
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

const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_EARNINGS_CACHE_KEY = 'clareza:earnings-data'
export const CACHE_TTL = 43200

export const COMPANIES: string[] = [
  'NVDA','AAPL','GOOGL','MSFT','AMZN','AVGO','META','TSLA','AMD','NFLX',
  'PLTR','CRM','ADBE','ORCL','LRCX','AMAT','KLAC','ANET','NOW','PANW',
  'MRVL','MU','UBER','APP','CRWD','INTU','ADSK','WDAY','DDOG','TTD',
  'IBM','INTC','CSCO','TXN','ACN','FICO','DELL','APH','ADI','QCOM',
  'ISRG','LLY','VRTX','REGN','BSX','HCA','SYK','ELV','HWM',
  'COST','TMUS','GEV','GE','CEG','SPGI','CME','MCO','BLK','BKNG',
  'SBUX','NKE','LULU','BRK-B','JPM','BAC','WFC','GS','MS','C',
  'AXP','SCHW','COF','USB','PNC','CB','PGR','MET','AFL','V','MA',
  'XOM','CVX','COP','EOG','SLB','MPC','OXY',
  'CAT','RTX','HON','LMT','NOC','GD','BA','UPS','UNP','DE',
  'ETN','ITW','EMR','WM',
  'WMT','HD','LOW','MCD','DIS','CMCSA','TGT',
  'PG','KO','PEP','PM','MO','CL','KMB','GIS',
  'JNJ','MRK','ABT','AMGN','TMO','DHR','UNH','ABBV','BMY','PFE','GILD','MDT','NOVO-B.CO',
  'NEE','DUK','SO','D','AEP','EXC',
  'VZ','T','LIN','SHW','NEM','FCX',
  'O','VICI','PLD','PSA','DLR','EQIX','AMT','CCI','SPG',
  'AVB','EQR','WPC','IRM','ARE','WELL','VTR','NNN','EXR',
  'ESS','MAA','UDR','CPT','KIM','REG','FRT','BXP',
  'NBIS',
  'SPCX',
  '2330.TW',
  'ASML.AS',
  'RACE.MI',
  'THEON.AS',
  'NESN.SW',
  'SIE.DE',
  'MC.PA',
  '005930.KS',
  '000660.KS',
  'SAB.MC',
  'SAP.DE',
  'SAF.PA',
  'RHM.DE',
  'DG.PA',
]

export const CURRENCY_MAP: Record<string, string> = {
  '2330.TW': 'TWD',
  'ASML.AS': 'EUR',
  'NOVO-B.CO': 'DKK',
  'NESN.SW': 'CHF',
  'SIE.DE': 'EUR',
  'MC.PA': 'EUR',
  '005930.KS': 'KRW',
  '000660.KS': 'KRW',
  'SAB.MC': 'EUR',
  'SAP.DE': 'EUR',
  'RACE.MI': 'EUR',
  'SAF.PA': 'EUR',
  'RHM.DE': 'EUR',
  'DG.PA': 'EUR',
  'THEON.AS': 'EUR',
}

type EarningsRow = {
  date?: string
  epsEstimated?: number | string | null
  epsActual?: number | string | null
  reportedEPS?: number | string | null
}

type EarningsEntry = {
  t: string
  d: string
  e: number | null
  c: string
  lr?: {
    d: string
    r: number | null
    e: number | null
    b: boolean | null
  }
}

type EarningsPayload = {
  updated: string
  window: { from: string; to: string }
  count: number
  earnings: EarningsEntry[]
}

async function fmpGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    await fmpThrottle()
    const { data } = await axios.get(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    if (!data || (!Array.isArray(data) && (data as any)['Error Message'])) return null
    if (Array.isArray(data)) return data as T
    return data as T
  } catch {
    return null
  }
}

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function timestamp(): string {
  return new Date().toISOString()
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null
  return Number(value)
}

function round4OrNull(value: unknown): number | null {
  const n = numberOrNull(value)
  return n === null ? null : Math.round(n * 10000) / 10000
}

export async function fetchEarningsForTicker(
  ticker: string,
  today = isoDate(),
  limitDt = isoDate(120)
): Promise<EarningsEntry | null> {
  const rows = await fmpGet<EarningsRow[]>('/earnings', { symbol: ticker, limit: '8' })
  if (!Array.isArray(rows)) throw new Error('Resposta FMP invalida')

  let next: EarningsRow | null = null
  let last: EarningsRow | null = null

  for (const row of rows) {
    const date = row?.date ?? ''
    if (!date) continue

    if (date >= today) {
      if (!next) next = row
    } else if (!last) {
      last = row
    }
  }

  if (!next || !next.date || next.date > limitDt) return null

  const entry: EarningsEntry = {
    t: ticker,
    d: next.date,
    e: round4OrNull(next.epsEstimated),
    c: CURRENCY_MAP[ticker] ?? 'USD'
  }

  if (last) {
    const epsReal = last.epsActual ?? last.reportedEPS ?? null
    const epsEst = last.epsEstimated ?? null
    const realRaw = numberOrNull(epsReal)
    const estimatedRaw = numberOrNull(epsEst)
    entry.lr = {
      d: last.date ?? '',
      r: round4OrNull(epsReal),
      e: round4OrNull(epsEst),
      b: realRaw !== null && estimatedRaw !== null ? realRaw >= estimatedRaw : null
    }
  }

  return entry
}

export async function refreshClarezaEarningsData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`[ClarezaEarnings] Iniciando refresh de ${COMPANIES.length} tickers...`)
  let errors = 0
  const today = isoDate()
  const limitDt = isoDate(120)

  const results = await runWithConcurrency(
    COMPANIES.map(ticker => async () => {
      try {
        return await fetchEarningsForTicker(ticker, today, limitDt)
      } catch (err: any) {
        errors++
        console.error(`[ClarezaEarnings] Erro em ${ticker}:`, err.message)
        return null
      }
    }),
    12
  )

  const earnings = results
    .filter((entry: EarningsEntry | null): entry is EarningsEntry => entry !== null)
    .sort((a, b) => a.d.localeCompare(b.d))

  const payload: EarningsPayload = {
    updated: timestamp(),
    window: { from: today, to: limitDt },
    count: earnings.length,
    earnings
  }

  await cacheService.set(CLAREZA_EARNINGS_CACHE_KEY, payload, CACHE_TTL)

  try {
    await ClarezaEarningsData.create({
      fetchedAt: new Date(),
      itemCount: earnings.length,
      errors,
      earnings: payload
    })
    const all = await ClarezaEarningsData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map((d: any) => d._id)
      await ClarezaEarningsData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log('[ClarezaEarnings] Snapshot guardado na BD')
  } catch (err: any) {
    console.error('[ClarezaEarnings] Erro ao guardar snapshot na BD:', err.message)
  }

  console.log(`[ClarezaEarnings] Refresh completo - ${earnings.length} ok, ${errors} erros`)
  return { total: COMPANIES.length, errors }
}

export async function getClarezaEarningsData(): Promise<EarningsPayload | null> {
  const cached = await cacheService.get<EarningsPayload>(CLAREZA_EARNINGS_CACHE_KEY)
  if (cached) return cached

  try {
    const latest = await ClarezaEarningsData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.earnings?.earnings?.length) {
      console.log(`[ClarezaEarnings] Cache Redis vazio - a servir snapshot da BD (${latest.fetchedAt})`)
      await cacheService.set(CLAREZA_EARNINGS_CACHE_KEY, latest.earnings, CACHE_TTL)
      return latest.earnings as EarningsPayload
    }
  } catch (err: any) {
    console.error('[ClarezaEarnings] Erro ao ler snapshot da BD:', err.message)
  }

  console.warn('[ClarezaEarnings] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}