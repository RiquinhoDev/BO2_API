import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreRaioxComplementSource } from './coreRaioxComposition'

type JsonRecord = Record<string, unknown>
type PricePoint = { readonly d: string; readonly c: number }

export interface CoreRaioxCompanionFmpPort {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

interface CoreRaioxCompanionCollectorOptions {
  readonly concurrency: number
  readonly now: () => Date
}

export interface CoreRaioxCompanionCollection {
  readonly generationId: string
  readonly createdAt: Date
  readonly sectorPe: readonly unknown[]
  readonly companions: Readonly<Record<string, CoreRaioxComplementSource>>
  readonly errors: readonly { readonly ticker: string; readonly code: string }[]
}

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function first(value: unknown): JsonRecord {
  if (Array.isArray(value)) return record(value[0]) ?? {}
  return record(value) ?? {}
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code
    if (typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(code)) return code
  }
  return 'RAIOX_COMPANION_FETCH_FAILED'
}

function dateRange(now: Date): { readonly from: string; readonly to: string } {
  const from = new Date(now)
  from.setUTCFullYear(from.getUTCFullYear() - 5)
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
}

function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

// Último dia útil ESTRITAMENTE antes de agora (salta fim de semana), como
// o last_bday() do PHP. O snapshot setorial de "hoje" ainda não existe
// quando o refresh corre de madrugada, após o fecho do mercado US.
function lastBusinessDay(now: Date): string {
  const date = new Date(now.getTime())
  do {
    date.setUTCDate(date.getUTCDate() - 1)
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return date.toISOString().slice(0, 10)
}

function compressHistory(raw: unknown, now: Date): PricePoint[] {
  if (!Array.isArray(raw)) return []
  const rows = raw.filter((value): value is JsonRecord => record(value) !== null)
    .sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? '')))
  const dailyCutoff = isoDaysBefore(now, 182)
  const historyCutoff = isoDaysBefore(now, 365 * 5)
  const points: PricePoint[] = []
  let lastWeek: number | null = null
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10)
    const close = finite(row.price ?? row.close ?? row.adjClose)
    if (!date || close === null || date < historyCutoff) continue
    if (date >= dailyCutoff) {
      points.push({ d: date, c: Number(close.toFixed(2)) })
      continue
    }
    const week = Math.floor(Date.parse(`${date}T00:00:00Z`) / (7 * 86_400_000))
    if (week !== lastWeek) {
      points.push({ d: date, c: Number(close.toFixed(2)) })
      lastWeek = week
    }
  }
  return points
}

function momentum(
  stockHistory: readonly PricePoint[],
  spyHistory: readonly PricePoint[],
  now: Date,
): Record<string, { s: number | null; x: number | null }> | null {
  if (!stockHistory.length || !spyHistory.length) return null
  const stock = [...stockHistory].sort((left, right) => left.d.localeCompare(right.d))
  const spy = [...spyHistory].sort((left, right) => left.d.localeCompare(right.d))
  const periods: Readonly<Record<string, number>> = {
    '1M': 30, '3M': 90, '6M': 182, '1Y': 365, '3Y': 1095, '5Y': 1825,
  }
  const result: Record<string, { s: number | null; x: number | null }> = {}
  const change = (rows: readonly PricePoint[], cutoff: string): number | null => {
    let then: number | null = null
    for (const row of rows) {
      if (row.d <= cutoff) then = row.c
      else break
    }
    then ??= rows[0]?.c ?? null
    const current = rows.at(-1)?.c ?? null
    return then && current ? Number((((current - then) / then) * 100).toFixed(2)) : null
  }
  for (const [label, days] of Object.entries(periods)) {
    const cutoff = isoDaysBefore(now, days)
    result[label] = { s: change(stock, cutoff), x: change(spy, cutoff) }
  }
  return result
}

function forwardPe(profile: JsonRecord, estimates: readonly unknown[], now: Date): number | null {
  const price = finite(profile.price)
  if (price === null) return null
  const today = now.toISOString().slice(0, 10)
  const next = estimates
    .map(record)
    .filter((item): item is JsonRecord => item !== null && typeof item.date === 'string' && item.date > today)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0]
  const eps = finite(next?.epsAvg)
  return eps !== null && eps > 0 ? Number((price / eps).toFixed(2)) : null
}

export class CoreRaioxCompanionCollector {
  constructor(
    private readonly fmp: CoreRaioxCompanionFmpPort,
    private readonly universe: readonly ClarezaAsset[],
    private readonly options: CoreRaioxCompanionCollectorOptions,
  ) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) {
      throw new RangeError('Raio-X companion concurrency must be between 1 and 20')
    }
  }

  async collect(generationId: string): Promise<CoreRaioxCompanionCollection> {
    if (!generationId.trim()) throw new RangeError('Raio-X companion generation is required')
    const now = this.options.now()
    if (Number.isNaN(now.getTime())) throw new RangeError('Raio-X companion timestamp is invalid')
    const range = dateRange(now)
    const [sectorPeRaw, spyRaw] = await Promise.all([
      this.fmp.get('/sector-pe-snapshot', { date: lastBusinessDay(now) }),
      this.fmp.get('/historical-price-eod/light', { symbol: 'SPY', ...range }),
    ])
    const sectorPe = array(sectorPeRaw)
    const spy = compressHistory(spyRaw, now)
    const assets = this.universe.filter(asset => asset.kind === 'stock' && asset.type !== 'reit')
    const companions: Record<string, CoreRaioxComplementSource> = {}
    const errors: Array<{ ticker: string; code: string }> = []
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < assets.length) {
        const asset = assets[next++]
        try {
          companions[asset.ticker] = await this.fetchItem(asset.ticker, spy, now, range)
        } catch (error: unknown) {
          errors.push({ ticker: asset.ticker, code: errorCode(error) })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, assets.length) }, worker))
    return { generationId, createdAt: now, sectorPe, companions, errors }
  }

  private async fetchItem(
    ticker: string,
    spy: readonly PricePoint[],
    now: Date,
    range: { readonly from: string; readonly to: string },
  ): Promise<CoreRaioxComplementSource> {
    const requests = await Promise.all([
      this.fmp.get('/profile', { symbol: ticker }),
      this.fmp.get('/analyst-estimates', { symbol: ticker, period: 'annual', limit: '10' }),
      this.fmp.get('/income-statement', { symbol: ticker, period: 'annual', limit: '8' }),
      this.fmp.get('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '8' }),
      this.fmp.get('/income-statement', { symbol: ticker, period: 'quarter', limit: '8' }),
      this.fmp.get('/cash-flow-statement', { symbol: ticker, period: 'quarter', limit: '8' }),
      this.fmp.get('/ratios', { symbol: ticker, period: 'annual', limit: '8' }),
      this.fmp.get('/grades-consensus', { symbol: ticker }),
      this.fmp.get('/price-target-consensus', { symbol: ticker }),
      this.fmp.get('/earnings', { symbol: ticker, limit: '8' }),
      this.fmp.get('/dividends', { symbol: ticker, limit: '60' }),
      this.fmp.get('/stock-peers', { symbol: ticker }),
      this.fmp.get('/historical-price-eod/light', { symbol: ticker, ...range }),
      this.fmp.get('/revenue-product-segmentation', { symbol: ticker, period: 'quarter', limit: '1' }),
    ])
    const profile = first(requests[0])
    if (!Object.keys(profile).length) throw Object.assign(new Error('profile missing'), { code: 'PROFILE_MISSING' })
    const peersRaw = array(requests[11])
    const firstPeers = first(peersRaw)
    const peers = (Array.isArray(firstPeers.peersList)
      ? firstPeers.peersList
      : peersRaw.map(item => record(item)?.symbol))
      .filter((value): value is string => typeof value === 'string' && value !== ticker)
      .slice(0, 3)
    const peerRows = await Promise.all(peers.map(async peer => ({
      peer,
      ratios: first(await this.fmp.get('/ratios-ttm', { symbol: peer })),
    })))
    const peerRatios = Object.fromEntries(peerRows.map(({ peer, ratios }) => [peer, {
      g: ratios.grossProfitMarginTTM ?? null,
      n: ratios.netProfitMarginTTM ?? null,
    }]))
    return {
      profileExtra: {
        ceo: profile.ceo ?? null,
        fullTimeEmployees: profile.fullTimeEmployees ?? null,
        country: profile.country ?? null,
        industry: profile.industry ?? null,
      },
      forwardPe: forwardPe(profile, array(requests[1]), now),
      annualIncome: array(requests[2]),
      annualCashFlow: array(requests[3]),
      quarterlyIncome: array(requests[4]),
      quarterlyCashFlow: array(requests[5]),
      annualRatios: array(requests[6]),
      gradesConsensus: first(requests[7]),
      priceTargetConsensus: first(requests[8]),
      earnings: array(requests[9]),
      dividends: array(requests[10]),
      peerRatios,
      momentum: momentum(compressHistory(requests[12], now), spy, now),
      segmentation: array(requests[13]),
      updated: now.toISOString(),
    }
  }
}
