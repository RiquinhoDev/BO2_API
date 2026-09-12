// Contador de consumo em memoria. E o unico sitio do processo onde se regista
// "isto aconteceu"; tudo o resto (Redis, Mongo, painel) le daqui.
//
// Regra de ouro: um incremento nao pode custar I/O. O caminho quente e um
// Map.set sobre uma string ja construida. O custo real (Redis) e pago uma vez
// por minuto pelo flush, fora do pedido do utilizador.

// Fronteiras de latencia em milissegundos. Guardamos contagens por balde em vez
// de amostras: e tudo inteiro, agrega-se entre replicas com HINCRBY e chega para
// p95/p99. Guardar amostras dava exatidao que nao precisamos e memoria que sim.
export const LATENCY_BUCKETS_MS: readonly number[] = [
  25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
]

export type UsageLabels = Readonly<Record<string, string>>

export interface UsageCounterEntry {
  readonly hour: string
  readonly metric: string
  readonly labels: UsageLabels
  readonly value: number
}

export interface UsageHistogramEntry {
  readonly hour: string
  readonly metric: string
  readonly labels: UsageLabels
  readonly count: number
  readonly sumMs: number
  /** Contagens por balde, alinhadas com LATENCY_BUCKETS_MS mais o balde "+Inf". */
  readonly buckets: readonly number[]
}

export interface UsageDrain {
  readonly counters: readonly UsageCounterEntry[]
  readonly histograms: readonly UsageHistogramEntry[]
}

interface HistogramState {
  count: number
  sumMs: number
  readonly buckets: number[]
}

/** Hora UTC a que um evento pertence, ex.: "2026-09-11T14". */
export function usageHour(at: Date = new Date()): string {
  return at.toISOString().slice(0, 13)
}

// Os separadores da chave (e, mais a jusante, dos campos do Redis) nao podem
// aparecer dentro de um valor: um template de rota ou um nome de endpoint vindo
// de fora nao tem de respeitar a nossa codificacao.
const SEPARATOR = '|'

export function sanitizeUsageToken(value: string): string {
  return value.replace(/[|,=]/g, '_')
}

function serializeLabels(labels: UsageLabels): string {
  const names = Object.keys(labels).sort()
  if (names.length === 0) return ''
  return names
    .map((name) => `${sanitizeUsageToken(name)}=${sanitizeUsageToken(labels[name])}`)
    .join(',')
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

function entryKey(hour: string, metric: string, labels: UsageLabels): string {
  return [hour, sanitizeUsageToken(metric), serializeLabels(labels)].join(SEPARATOR)
}

function splitKey(key: string): { hour: string; metric: string; labels: UsageLabels } {
  const [hour, metric, serialized] = key.split(SEPARATOR)
  return { hour, metric, labels: parseLabels(serialized ?? '') }
}

function bucketIndex(milliseconds: number): number {
  for (let index = 0; index < LATENCY_BUCKETS_MS.length; index += 1) {
    if (milliseconds <= LATENCY_BUCKETS_MS[index]) return index
  }
  return LATENCY_BUCKETS_MS.length
}

export class UsageMeter {
  private counters = new Map<string, number>()
  private histograms = new Map<string, HistogramState>()

  count(metric: string, labels: UsageLabels = {}, value = 1, at?: Date): void {
    if (!Number.isFinite(value)) return
    const key = entryKey(usageHour(at), metric, labels)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  observe(metric: string, milliseconds: number, labels: UsageLabels = {}, at?: Date): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return
    const key = entryKey(usageHour(at), metric, labels)
    let state = this.histograms.get(key)
    if (!state) {
      state = {
        count: 0,
        sumMs: 0,
        buckets: new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0),
      }
      this.histograms.set(key, state)
    }
    state.count += 1
    state.sumMs += milliseconds
    state.buckets[bucketIndex(milliseconds)] += 1
  }

  /**
   * Devolve tudo o que foi acumulado e limpa. Quem chama fica responsavel por
   * entregar os dados; se a entrega falhar, os incrementos perdem-se de
   * proposito — reenfileirar significaria crescer sem limite quando o Redis
   * esta em baixo, que e exatamente quando nao podemos gastar memoria.
   */
  drain(): UsageDrain {
    const counters: UsageCounterEntry[] = []
    for (const [key, value] of this.counters) {
      counters.push({ ...splitKey(key), value })
    }

    const histograms: UsageHistogramEntry[] = []
    for (const [key, state] of this.histograms) {
      histograms.push({
        ...splitKey(key),
        count: state.count,
        sumMs: state.sumMs,
        buckets: state.buckets.slice(),
      })
    }

    this.counters = new Map()
    this.histograms = new Map()
    return { counters, histograms }
  }

  /** Numero de series distintas vivas. Serve para vigiar a propria medicao. */
  get seriesCount(): number {
    return this.counters.size + this.histograms.size
  }
}

export const usageMeter = new UsageMeter()

export function countUsage(metric: string, labels?: UsageLabels, value?: number): void {
  usageMeter.count(metric, labels, value)
}

export function observeUsage(metric: string, milliseconds: number, labels?: UsageLabels): void {
  usageMeter.observe(metric, milliseconds, labels)
}
