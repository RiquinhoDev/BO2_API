// Agregacao entre replicas. O contador em memoria so conhece este processo; o
// Railway pode correr mais do que um. Cada processo despeja o que contou para
// um hash Redis por hora e o snapshot horario le o total ja somado.
//
// Tudo o que vai para o Redis e inteiro, para poder usar HINCRBY: somar entre
// replicas sem ler-modificar-escrever e sem perder incrementos em corrida.

import type {
  UsageCounterEntry,
  UsageDrain,
  UsageHistogramEntry,
  UsageLabels,
} from './usageMeter'
import { LATENCY_BUCKETS_MS } from './usageMeter'

/** Quinze dias: o snapshot horario ja arquivou muito antes; isto e so rede de seguranca. */
export const USAGE_HOUR_TTL_SECONDS = 15 * 24 * 60 * 60

export interface UsageStoreCommandPort {
  incrementFields(
    key: string,
    fields: ReadonlyArray<readonly [string, number]>,
    ttlSeconds: number,
  ): Promise<void>
  readHash(key: string): Promise<Readonly<Record<string, string>>>
  deleteKey(key: string): Promise<void>
}

export function usageHourKey(hour: string): string {
  return `usage:h:${hour}`
}

function counterField(metric: string, labels: string): string {
  return `c|${metric}|${labels}`
}

function histogramField(metric: string, labels: string, suffix: string): string {
  return `h|${metric}|${labels}|${suffix}`
}

function serializeLabels(labels: UsageLabels): string {
  const names = Object.keys(labels).sort()
  if (names.length === 0) return ''
  return names.map((name) => `${name}=${labels[name]}`).join(',')
}

function parseLabels(serialized: string): UsageLabels {
  if (!serialized) return {}
  const labels: Record<string, string> = {}
  for (const pair of serialized.split(',')) {
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    labels[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
  return labels
}

/**
 * Escreve um drain no hash da hora correspondente. Um drain pode tocar em mais
 * do que uma hora quando apanha a viragem, por isso agrupamos por hora antes
 * de escrever.
 */
export async function writeUsageDrain(
  port: UsageStoreCommandPort,
  drain: UsageDrain,
  ttlSeconds: number = USAGE_HOUR_TTL_SECONDS,
): Promise<void> {
  const byHour = new Map<string, Array<readonly [string, number]>>()
  const push = (hour: string, field: string, value: number): void => {
    if (value === 0) return
    const fields = byHour.get(hour) ?? []
    fields.push([field, value])
    byHour.set(hour, fields)
  }

  for (const entry of drain.counters) {
    const labels = serializeLabels(entry.labels)
    push(entry.hour, counterField(entry.metric, labels), Math.round(entry.value))
  }

  for (const entry of drain.histograms) {
    const labels = serializeLabels(entry.labels)
    push(entry.hour, histogramField(entry.metric, labels, 'n'), entry.count)
    push(entry.hour, histogramField(entry.metric, labels, 's'), Math.round(entry.sumMs))
    entry.buckets.forEach((count, index) => {
      push(entry.hour, histogramField(entry.metric, labels, `b${index}`), count)
    })
  }

  for (const [hour, fields] of byHour) {
    await port.incrementFields(usageHourKey(hour), fields, ttlSeconds)
  }
}

export interface UsageHourReadout {
  readonly hour: string
  readonly counters: readonly UsageCounterEntry[]
  readonly histograms: readonly UsageHistogramEntry[]
}

interface HistogramAccumulator {
  metric: string
  labels: UsageLabels
  count: number
  sumMs: number
  buckets: number[]
}

function toInteger(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Le o total ja somado de todas as replicas para uma hora. */
export async function readUsageHour(
  port: UsageStoreCommandPort,
  hour: string,
): Promise<UsageHourReadout> {
  const raw = await port.readHash(usageHourKey(hour))
  const counters: UsageCounterEntry[] = []
  const histograms = new Map<string, HistogramAccumulator>()

  for (const [field, value] of Object.entries(raw)) {
    const parts = field.split('|')
    if (parts[0] === 'c' && parts.length >= 3) {
      counters.push({
        hour,
        metric: parts[1],
        labels: parseLabels(parts[2]),
        value: toInteger(value),
      })
      continue
    }
    if (parts[0] !== 'h' || parts.length < 4) continue

    const [, metric, labels, suffix] = parts
    const key = `${metric}|${labels}`
    let accumulator = histograms.get(key)
    if (!accumulator) {
      accumulator = {
        metric,
        labels: parseLabels(labels),
        count: 0,
        sumMs: 0,
        buckets: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0),
      }
      histograms.set(key, accumulator)
    }

    if (suffix === 'n') accumulator.count = toInteger(value)
    else if (suffix === 's') accumulator.sumMs = toInteger(value)
    else if (suffix.startsWith('b')) {
      const index = Number(suffix.slice(1))
      if (Number.isInteger(index) && index >= 0 && index < accumulator.buckets.length) {
        accumulator.buckets[index] = toInteger(value)
      }
    }
  }

  return {
    hour,
    counters,
    histograms: [...histograms.values()].map((accumulator) => ({
      hour,
      metric: accumulator.metric,
      labels: accumulator.labels,
      count: accumulator.count,
      sumMs: accumulator.sumMs,
      buckets: accumulator.buckets,
    })),
  }
}

export async function dropUsageHour(
  port: UsageStoreCommandPort,
  hour: string,
): Promise<void> {
  await port.deleteKey(usageHourKey(hour))
}

/**
 * Percentil aproximado a partir das contagens por balde. Devolve a fronteira
 * superior do balde onde o percentil cai: com baldes, dizer "p95 abaixo de
 * 500ms" e honesto, dizer "p95 = 412ms" nao era.
 */
export function bucketPercentile(
  buckets: readonly number[],
  percentile: number,
): number | null {
  const total = buckets.reduce((sum, count) => sum + count, 0)
  if (total === 0) return null

  const target = total * percentile
  let seen = 0
  for (let index = 0; index < buckets.length; index += 1) {
    seen += buckets[index]
    if (seen >= target) {
      return index < LATENCY_BUCKETS_MS.length ? LATENCY_BUCKETS_MS[index] : Infinity
    }
  }
  return Infinity
}
