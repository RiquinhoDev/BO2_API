// Colapsa o detalhe em resumos. O dia nasce dos snapshots horarios; a semana
// nasce dos dias. Depois disto o horario pode morrer sem levar a historia atras.

import logger from '../../utils/logger'
import UsageSnapshot, { type IUsageSnapshot } from '../../models/UsageSnapshot'
import UsageRollup, {
  type IUsageRollupPoint,
  type UsagePeriod,
} from '../../models/UsageRollup'
import { buildDailySeries, type DailyUsagePoint } from './usageAggregation'

/** Um ano e pouco de resumos diarios; os semanais nao expiram. */
export const DAILY_ROLLUP_TTL_DAYS = 400

const DAY_MS = 24 * 60 * 60 * 1_000

type PointKey = keyof IUsageRollupPoint

const POINT_KEYS: readonly PointKey[] = [
  'httpRequests',
  'httpErrors',
  'httpServerErrors',
  'httpLatencyP95Ms',
  'egressBytes',
  'providerCalls',
  'fmpCalls',
  'fmpRateLimited',
  'fmpDeduplicated',
  'mongoCommands',
  'mongoTotalBytes',
  'mongoCountedBytes',
  'redisUsedBytesPeak',
  'redisEvictedKeys',
  'redisHitRate',
  'cacheHits',
  'cacheMisses',
  'jobRuns',
  'jobFailures',
  'rssBytesPeak',
  'eventLoopP99MsPeak',
  'students',
  'activeStudents',
  'processRestarts',
]

/**
 * Metricas que descrevem um estado acumulado, nao um caudal. A media de uma
 * semana de espaco ocupado nao tem significado util — o que interessa e onde
 * ficou no fim, porque e esse o valor que conta contra o tecto.
 */
const LEVEL_KEYS: ReadonlySet<PointKey> = new Set<PointKey>([
  'mongoTotalBytes',
  'mongoCountedBytes',
  'students',
  'activeStudents',
])

function emptyPoint(): IUsageRollupPoint {
  return {
    httpRequests: 0,
    httpErrors: 0,
    httpServerErrors: 0,
    httpLatencyP95Ms: null,
    egressBytes: 0,
    providerCalls: 0,
    fmpCalls: 0,
    fmpRateLimited: 0,
    fmpDeduplicated: 0,
    mongoCommands: 0,
    mongoTotalBytes: null,
    mongoCountedBytes: null,
    redisUsedBytesPeak: null,
    redisEvictedKeys: null,
    redisHitRate: null,
    cacheHits: 0,
    cacheMisses: 0,
    jobRuns: 0,
    jobFailures: 0,
    rssBytesPeak: null,
    eventLoopP99MsPeak: null,
    students: null,
    activeStudents: null,
    processRestarts: 0,
  }
}

function toPoint(daily: DailyUsagePoint): IUsageRollupPoint {
  const point = emptyPoint()
  for (const key of POINT_KEYS) {
    const value = (daily as unknown as Record<string, unknown>)[key]
    if (typeof value === 'number' || value === null) {
      ;(point as unknown as Record<string, unknown>)[key] = value
    }
  }
  return point
}

function numbersFor(points: readonly IUsageRollupPoint[], key: PointKey): number[] {
  return points
    .map((point) => point[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

export function averagePoints(points: readonly IUsageRollupPoint[]): IUsageRollupPoint {
  const result = emptyPoint()
  for (const key of POINT_KEYS) {
    const values = numbersFor(points, key)
    if (values.length === 0) continue
    const value = LEVEL_KEYS.has(key)
      ? values[values.length - 1]
      : values.reduce((sum, entry) => sum + entry, 0) / values.length
    ;(result as unknown as Record<string, unknown>)[key] = value
  }
  return result
}

export function peakPoints(points: readonly IUsageRollupPoint[]): IUsageRollupPoint {
  const result = emptyPoint()
  for (const key of POINT_KEYS) {
    const values = numbersFor(points, key)
    if (values.length === 0) continue
    ;(result as unknown as Record<string, unknown>)[key] = Math.max(...values)
  }
  return result
}

function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

/** Dia UTC anterior a `now`, ex.: "2026-09-10". */
export function previousDay(now: Date): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10)
}

/** Chave ISO da semana, ex.: "2026-W37". Segunda a domingo, como manda a norma. */
export function isoWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Quinta-feira da mesma semana decide o ano ISO: e a unica forma de acertar
  // nas semanas que atravessam o Ano Novo.
  const dayOfWeek = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Segunda-feira UTC da semana a que `date` pertence. */
export function startOfIsoWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayOfWeek = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - dayOfWeek)
  return start
}

/**
 * Fecha um dia. Le os snapshots horarios desse dia e grava um documento com os
 * totais; media e pico coincidem, porque um dia e um ponto so.
 */
export async function buildDailyRollup(
  day: string,
  now: Date = new Date(),
): Promise<boolean> {
  const from = startOfDay(day)
  const to = new Date(from.getTime() + DAY_MS)

  const snapshots = (await UsageSnapshot.find({ capturedAt: { $gte: from, $lt: to } })
    .sort({ hour: 1 })
    .lean()
    .exec()) as unknown as IUsageSnapshot[]

  if (snapshots.length === 0) return false

  const series = buildDailySeries(snapshots)
  const daily = series.find((entry) => entry.day === day) ?? series[0]
  if (!daily) return false

  const point = toPoint(daily)

  await UsageRollup.findOneAndUpdate(
    { period: 'day' as UsagePeriod, key: day },
    {
      period: 'day',
      key: day,
      from,
      to,
      days: 1,
      average: point,
      peak: point,
      peakDay: day,
      expiresAt: new Date(now.getTime() + DAILY_ROLLUP_TTL_DAYS * DAY_MS),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec()

  return true
}

/**
 * Fecha uma semana a partir dos resumos diarios. Nao volta aos snapshots
 * horarios de proposito: quando esta funcao corre, esses ja podem ter expirado.
 */
export async function buildWeeklyRollup(
  weekStart: Date,
): Promise<boolean> {
  const from = startOfIsoWeek(weekStart)
  const to = new Date(from.getTime() + 7 * DAY_MS)
  const key = isoWeekKey(from)

  const days = await UsageRollup.find({ period: 'day', from: { $gte: from, $lt: to } })
    .sort({ from: 1 })
    .lean()
    .exec()

  if (days.length === 0) return false

  const points = days.map((entry) => entry.average as IUsageRollupPoint)
  const peak = peakPoints(points)
  const peakFmp = peak.fmpCalls
  const peakDay = days.find(
    (entry) => (entry.average as IUsageRollupPoint).fmpCalls === peakFmp,
  )?.key ?? null

  await UsageRollup.findOneAndUpdate(
    { period: 'week' as UsagePeriod, key },
    {
      period: 'week',
      key,
      from,
      to,
      days: days.length,
      average: averagePoints(points),
      peak,
      peakDay,
      // Sem expiresAt: os semanais ficam para sempre. São a memória longa e
      // custam 52 documentos por ano.
      expiresAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec()

  return true
}

/** Fecha o dia anterior e, à segunda-feira, também a semana que acabou. */
export async function runUsageRollups(now: Date = new Date()): Promise<void> {
  const day = previousDay(now)
  try {
    const wrote = await buildDailyRollup(day, now)
    if (wrote) logger.info(`📊 Resumo diário de consumo gravado para ${day}`)
  } catch (error) {
    logger.error('Erro ao gravar resumo diário de consumo', { error })
  }

  const isMonday = now.getUTCDay() === 1
  if (!isMonday) return

  try {
    const previousWeek = new Date(now.getTime() - 7 * DAY_MS)
    const wrote = await buildWeeklyRollup(previousWeek)
    if (wrote) logger.info(`📊 Resumo semanal gravado para ${isoWeekKey(startOfIsoWeek(previousWeek))}`)
  } catch (error) {
    logger.error('Erro ao gravar resumo semanal de consumo', { error })
  }
}
