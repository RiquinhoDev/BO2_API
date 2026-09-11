// Transforma snapshots horarios naquilo que o painel mostra. Toda a aritmetica
// de agregacao vive aqui para o servico de relatorio ficar so com a leitura da
// Mongo e a composicao da resposta.

import type { IUsageSnapshot } from '../../models/UsageSnapshot'
import { LATENCY_BUCKETS_MS } from '../../observability/usage/usageMeter'
import { bucketPercentile } from '../../observability/usage/usageStore'

export type LabelFilter = Readonly<Record<string, string>>

function matches(labels: Record<string, string>, filter?: LabelFilter): boolean {
  if (!filter) return true
  return Object.entries(filter).every(([name, value]) => labels[name] === value)
}

/** Soma um contador ao longo de um conjunto de snapshots. */
export function sumCounter(
  snapshots: readonly IUsageSnapshot[],
  metric: string,
  filter?: LabelFilter,
): number {
  let total = 0
  for (const snapshot of snapshots) {
    for (const entry of snapshot.counters) {
      if (entry.metric !== metric) continue
      if (!matches(entry.labels, filter)) continue
      total += entry.value
    }
  }
  return total
}

/** Reparte um contador pelos valores de um label, ordenado do maior para o menor. */
export function groupCounter(
  snapshots: readonly IUsageSnapshot[],
  metric: string,
  labelName: string,
  filter?: LabelFilter,
): Array<{ key: string; value: number }> {
  const totals = new Map<string, number>()
  for (const snapshot of snapshots) {
    for (const entry of snapshot.counters) {
      if (entry.metric !== metric) continue
      if (!matches(entry.labels, filter)) continue
      const key = entry.labels[labelName] ?? 'desconhecido'
      totals.set(key, (totals.get(key) ?? 0) + entry.value)
    }
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value)
}

/**
 * Reparte o tempo total de um histograma pelos valores de um label. Serve para
 * "que jobs consomem mais tempo" — a pergunta certa e quanto tempo, nao quantas
 * vezes: um cron que corre uma vez e demora vinte minutos custa mais do que mil
 * chamadas de dez milissegundos.
 */
export function groupHistogramSum(
  snapshots: readonly IUsageSnapshot[],
  metric: string,
  labelName: string,
  filter?: LabelFilter,
): Array<{ key: string; value: number }> {
  const totals = new Map<string, number>()
  for (const snapshot of snapshots) {
    for (const entry of snapshot.histograms) {
      if (entry.metric !== metric) continue
      if (!matches(entry.labels, filter)) continue
      const key = entry.labels[labelName] ?? 'desconhecido'
      totals.set(key, (totals.get(key) ?? 0) + entry.sumMs)
    }
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value)
}

export interface MergedHistogram {
  readonly count: number
  readonly sumMs: number
  readonly buckets: readonly number[]
  readonly averageMs: number | null
  readonly p95Ms: number | null
  readonly p99Ms: number | null
}

export function mergeHistogram(
  snapshots: readonly IUsageSnapshot[],
  metric: string,
  filter?: LabelFilter,
): MergedHistogram {
  const buckets = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0)
  let count = 0
  let sumMs = 0

  for (const snapshot of snapshots) {
    for (const entry of snapshot.histograms) {
      if (entry.metric !== metric) continue
      if (!matches(entry.labels, filter)) continue
      count += entry.count
      sumMs += entry.sumMs
      entry.buckets.forEach((value, index) => {
        if (index < buckets.length) buckets[index] += value
      })
    }
  }

  return {
    count,
    sumMs,
    buckets,
    averageMs: count === 0 ? null : sumMs / count,
    p95Ms: bucketPercentile(buckets, 0.95),
    p99Ms: bucketPercentile(buckets, 0.99),
  }
}

/** Dia UTC ("2026-09-11") a que uma hora ("2026-09-11T14") pertence. */
export function dayOf(hour: string): string {
  return hour.slice(0, 10)
}

export function groupByDay(
  snapshots: readonly IUsageSnapshot[],
): Array<{ day: string; snapshots: IUsageSnapshot[] }> {
  const days = new Map<string, IUsageSnapshot[]>()
  for (const snapshot of snapshots) {
    const day = dayOf(snapshot.hour)
    const bucket = days.get(day) ?? []
    bucket.push(snapshot)
    days.set(day, bucket)
  }
  return [...days.entries()]
    .map(([day, bucket]) => ({
      day,
      snapshots: bucket.sort((left, right) => left.hour.localeCompare(right.hour)),
    }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

function lastDefined<T>(
  snapshots: readonly IUsageSnapshot[],
  read: (snapshot: IUsageSnapshot) => T | null | undefined,
): T | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const value = read(snapshots[index])
    if (value !== null && value !== undefined) return value
  }
  return null
}

function peak(
  snapshots: readonly IUsageSnapshot[],
  read: (snapshot: IUsageSnapshot) => number | null | undefined,
): number | null {
  let highest: number | null = null
  for (const snapshot of snapshots) {
    const value = read(snapshot)
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (highest === null || value > highest) highest = value
  }
  return highest
}

/**
 * Quantas vezes o processo reiniciou. Detecta-se pelo uptime a descer entre
 * snapshots: o Railway reinicia o container em silencio, sem deixar rasto nos
 * nossos logs, e sem isto um ciclo de reinicios passa despercebido no painel.
 */
export function countProcessRestarts(snapshots: readonly IUsageSnapshot[]): number {
  let restarts = 0
  let previous: number | null = null
  for (const snapshot of snapshots) {
    const uptime = snapshot.process?.uptimeSeconds
    if (typeof uptime !== 'number') continue
    if (previous !== null && uptime < previous) restarts += 1
    previous = uptime
  }
  return restarts
}

/**
 * Diferenca de um contador acumulado do Redis ao longo do dia. O Redis zera
 * estes contadores quando reinicia; detectamos isso pelo uptime a descer e,
 * nesse caso, somamos o valor final em vez de subtrair — subtrair daria
 * negativo e esconderia precisamente o dia mais interessante.
 */
export function cumulativeDelta(
  snapshots: readonly IUsageSnapshot[],
  read: (redis: NonNullable<IUsageSnapshot['redis']>) => number,
): number | null {
  const points = snapshots
    .map((snapshot) => snapshot.redis)
    .filter((redis): redis is NonNullable<IUsageSnapshot['redis']> => Boolean(redis))
  if (points.length === 0) return null

  let total = 0
  let previous = points[0]
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]
    const restarted = current.uptimeSeconds < previous.uptimeSeconds
    const difference = restarted ? read(current) : read(current) - read(previous)
    if (difference > 0) total += difference
    previous = current
  }
  return total
}

export interface DailyUsagePoint {
  readonly day: string
  readonly httpRequests: number
  readonly httpErrors: number
  /** Só 5xx: erros nossos, não do cliente. É o sinal que precede um crash. */
  readonly httpServerErrors: number
  readonly httpLatencyP95Ms: number | null
  readonly egressBytes: number
  readonly providerCalls: number
  readonly fmpCalls: number
  readonly fmpRateLimited: number
  readonly fmpDeduplicated: number
  readonly mongoCommands: number
  readonly mongoTotalBytes: number | null
  readonly redisUsedBytesPeak: number | null
  readonly redisEvictedKeys: number | null
  readonly redisHitRate: number | null
  readonly cacheHits: number
  readonly cacheMisses: number
  readonly jobRuns: number
  readonly jobFailures: number
  readonly rssBytesPeak: number | null
  readonly eventLoopP99MsPeak: number | null
  readonly students: number | null
  readonly activeStudents: number | null
  /** Reinícios do processo detectados no dia. */
  readonly processRestarts: number
}

export function buildDailySeries(
  snapshots: readonly IUsageSnapshot[],
): readonly DailyUsagePoint[] {
  return groupByDay(snapshots).map(({ day, snapshots: daily }) => {
    const hits = sumCounter(daily, 'cache.ops', { op: 'get', outcome: 'hit' })
    const misses = sumCounter(daily, 'cache.ops', { op: 'get', outcome: 'miss' })
    const keyspaceHits = cumulativeDelta(daily, (redis) => redis.keyspaceHits)
    const keyspaceMisses = cumulativeDelta(daily, (redis) => redis.keyspaceMisses)
    const keyspaceTotal = (keyspaceHits ?? 0) + (keyspaceMisses ?? 0)

    return {
      day,
      httpRequests: sumCounter(daily, 'http.requests'),
      httpErrors:
        sumCounter(daily, 'http.requests', { status: '5xx' })
        + sumCounter(daily, 'http.requests', { status: '4xx' }),
      httpServerErrors: sumCounter(daily, 'http.requests', { status: '5xx' }),
      httpLatencyP95Ms: mergeHistogram(daily, 'http.latency').p95Ms,
      egressBytes: sumCounter(daily, 'http.response_bytes'),
      providerCalls: sumCounter(daily, 'provider.calls'),
      fmpCalls: sumCounter(daily, 'provider.calls', { provider: 'fmp' }),
      fmpRateLimited: sumCounter(daily, 'provider.calls', {
        provider: 'fmp',
        outcome: 'rate_limited',
      }),
      fmpDeduplicated: sumCounter(daily, 'provider.deduplicated', { provider: 'fmp' }),
      mongoCommands: sumCounter(daily, 'mongo.commands'),
      mongoTotalBytes: lastDefined(daily, (snapshot) => snapshot.mongo?.totalSizeBytes ?? null),
      redisUsedBytesPeak: peak(daily, (snapshot) => snapshot.redis?.usedMemoryBytes ?? null),
      redisEvictedKeys: cumulativeDelta(daily, (redis) => redis.evictedKeys),
      redisHitRate: keyspaceTotal === 0 ? null : (keyspaceHits ?? 0) / keyspaceTotal,
      cacheHits: hits,
      cacheMisses: misses,
      jobRuns: sumCounter(daily, 'job.runs'),
      jobFailures: sumCounter(daily, 'job.runs', { outcome: 'error' }),
      rssBytesPeak: peak(daily, (snapshot) => snapshot.process?.rssBytes ?? null),
      eventLoopP99MsPeak: peak(
        daily,
        (snapshot) => snapshot.process?.eventLoopDelayP99Ms ?? null,
      ),
      students: lastDefined(daily, (snapshot) => snapshot.business?.students ?? null),
      activeStudents: lastDefined(
        daily,
        (snapshot) => snapshot.business?.activeStudents ?? null,
      ),
      processRestarts: countProcessRestarts(daily),
    }
  })
}
