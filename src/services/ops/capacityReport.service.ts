// O relatorio que o painel desenha. Le a serie de snapshots ja gravada — uma
// query indexada por intervalo — e devolve tudo composto: consumo por frente,
// restricoes ordenadas por risco e a projecao por escala.
//
// Nenhuma sonda corre aqui. Quem abre o painel nao paga o custo de medir.

import UsageSnapshot, { type IUsageSnapshot } from '../../models/UsageSnapshot'
import { USAGE_METRICS } from '../../observability/usage/usageMetrics'
import { loadCapacityCeilings, type CapacityCeilings } from './capacityCeilings'
import {
  buildConstraint,
  projectScale,
  rankConstraints,
  type Constraint,
  type ScalableMetric,
  type ScaleProjection,
} from './capacityConstraints'
import {
  buildDailySeries,
  groupCounter,
  groupHistogramSum,
  mergeHistogram,
  sumCounter,
  type DailyUsagePoint,
} from './usageAggregation'

export const DEFAULT_RANGE_DAYS = 14
export const MAX_RANGE_DAYS = 120

export interface CapacityBreakdownRow {
  readonly key: string
  readonly value: number
}

export interface CapacityReport {
  readonly generatedAt: Date
  readonly range: { readonly fromDay: string; readonly toDay: string; readonly days: number }
  readonly hasData: boolean
  readonly ceilings: CapacityCeilings
  readonly constraints: readonly Constraint[]
  readonly daily: readonly DailyUsagePoint[]
  readonly totals: {
    readonly httpRequests: number
    readonly egressBytes: number
    readonly providerCalls: number
    readonly mongoCommands: number
    readonly jobRuns: number
    readonly jobFailures: number
    readonly httpLatencyP95Ms: number | null
    readonly httpLatencyP99Ms: number | null
  }
  readonly breakdowns: {
    readonly topRoutesByRequests: readonly CapacityBreakdownRow[]
    readonly topRoutesByEgress: readonly CapacityBreakdownRow[]
    readonly providerCalls: readonly CapacityBreakdownRow[]
    readonly fmpEndpoints: readonly CapacityBreakdownRow[]
    readonly mongoCommandsByCollection: readonly CapacityBreakdownRow[]
    readonly jobsByDuration: readonly CapacityBreakdownRow[]
  }
  readonly current: {
    readonly capturedAt: Date | null
    readonly mongo: IUsageSnapshot['mongo'] | null
    readonly redis: IUsageSnapshot['redis'] | null
    readonly process: IUsageSnapshot['process'] | null
    readonly railway: IUsageSnapshot['railway'] | null
    readonly business: IUsageSnapshot['business'] | null
  }
  readonly unitEconomics: {
    readonly activeStudents: number | null
    readonly fmpCallsPerStudentPerDay: number | null
    readonly httpRequestsPerStudentPerDay: number | null
    readonly mongoBytesPerStudent: number | null
    readonly redisBytesPerStudent: number | null
    readonly railwayCostPerStudentUsd: number | null
  }
  readonly projections: readonly ScaleProjection[]
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function averageOfLastDays(
  daily: readonly DailyUsagePoint[],
  read: (point: DailyUsagePoint) => number | null,
  days = 7,
): number | null {
  const values = daily
    .slice(-days)
    .map(read)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return numerator / denominator
}

function toRows(entries: ReadonlyArray<{ key: string; value: number }>, limit: number) {
  return entries.slice(0, limit)
}

export interface CapacityReportOptions {
  readonly days?: number
  readonly now?: Date
}

export async function buildCapacityReport(
  options: CapacityReportOptions = {},
): Promise<CapacityReport> {
  const now = options.now ?? new Date()
  const days = Math.min(Math.max(options.days ?? DEFAULT_RANGE_DAYS, 1), MAX_RANGE_DAYS)
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000)

  const snapshots = (await UsageSnapshot.find({ capturedAt: { $gte: from, $lte: now } })
    .sort({ hour: 1 })
    .lean()
    .exec()) as unknown as IUsageSnapshot[]

  const ceilings = loadCapacityCeilings()
  const daily = buildDailySeries(snapshots)
  const latest = snapshots[snapshots.length - 1] ?? null
  const latestDeep = [...snapshots].reverse().find((snapshot) => snapshot.deep) ?? null

  const httpLatency = mergeHistogram(snapshots, USAGE_METRICS.httpLatency)

  const activeStudents = latest?.business?.activeStudents
    ?? latest?.business?.students
    ?? null

  const fmpPerDay = averageOfLastDays(daily, (point) => point.fmpCalls)
  const requestsPerDay = averageOfLastDays(daily, (point) => point.httpRequests)
  const mongoBytes = latest?.mongo?.totalSizeBytes ?? null
  const redisBytes = latest?.redis?.usedMemoryBytes ?? null
  const railwayCost = latestDeep?.railway?.estimatedCostUsd ?? null

  const constraints = rankConstraints([
    buildConstraint({
      id: 'fmp.calls',
      label: 'Chamadas FMP por dia',
      unit: 'chamadas/dia',
      series: daily.map((point) => point.fmpCalls),
      ceiling: ceilings.fmpCallsPerDay,
      note: 'Quota do plano contratado na Financial Modeling Prep.',
    }),
    buildConstraint({
      id: 'mongo.storage',
      label: 'Espaco ocupado na Mongo',
      unit: 'bytes',
      series: daily.map((point) => point.mongoTotalBytes),
      ceiling: ceilings.mongoStorageBytes,
      note: 'Dados mais indices, como o servidor os reporta.',
    }),
    buildConstraint({
      id: 'redis.memory',
      label: 'Memoria usada no Redis (pico diario)',
      unit: 'bytes',
      series: daily.map((point) => point.redisUsedBytesPeak),
      ceiling: ceilings.redisMemoryBytes ?? latest?.redis?.maxMemoryBytes ?? null,
      note: 'Acima do teto o Redis comeca a despejar cache e a carga cai na Mongo.',
    }),
    buildConstraint({
      id: 'redis.evictions',
      label: 'Chaves despejadas por falta de memoria',
      unit: 'chaves/dia',
      series: daily.map((point) => point.redisEvictedKeys),
      // Qualquer despejo ja e sintoma: o "teto" e zero mais uma margem de ruido.
      ceiling: 1,
      note: 'Deveria ser zero. Acima disso a cache esta a ser deitada fora antes de expirar.',
    }),
    buildConstraint({
      id: 'process.memory',
      label: 'Memoria do processo (pico diario)',
      unit: 'bytes',
      series: daily.map((point) => point.rssBytesPeak),
      ceiling: ceilings.serviceMemoryBytes,
      note: 'Chegar ao teto e o container ser reiniciado pelo Railway.',
    }),
    buildConstraint({
      id: 'railway.cost',
      label: 'Custo estimado do ciclo no Railway',
      unit: 'USD',
      series: [railwayCost],
      ceiling: ceilings.railwayMonthlyBudgetUsd,
      note: 'Valor do ciclo de facturacao em curso.',
    }),
  ])

  const scalableMetrics: ScalableMetric[] = [
    {
      id: 'fmp.calls',
      label: 'Chamadas FMP por dia',
      unit: 'chamadas/dia',
      current: fmpPerDay ?? 0,
      ceiling: ceilings.fmpCallsPerDay,
      // O grosso da FMP e o refresh diario de mercado: corre igual com 100 ou
      // com 10.000 alunos. Tratar tudo como variavel exagerava a projecao.
      fixedPortion: (fmpPerDay ?? 0) * 0.8,
    },
    {
      id: 'mongo.storage',
      label: 'Espaco ocupado na Mongo',
      unit: 'bytes',
      current: mongoBytes ?? 0,
      ceiling: ceilings.mongoStorageBytes,
    },
    {
      id: 'redis.memory',
      label: 'Memoria usada no Redis',
      unit: 'bytes',
      current: redisBytes ?? 0,
      ceiling: ceilings.redisMemoryBytes ?? latest?.redis?.maxMemoryBytes ?? null,
    },
    {
      id: 'railway.cost',
      label: 'Custo mensal no Railway',
      unit: 'USD',
      current: railwayCost ?? 0,
      ceiling: ceilings.railwayMonthlyBudgetUsd,
      // Um servico tem sempre um piso: corre mesmo sem trafego nenhum.
      fixedPortion: (railwayCost ?? 0) * 0.4,
    },
  ]

  return {
    generatedAt: now,
    range: { fromDay: dayKey(from), toDay: dayKey(now), days },
    hasData: snapshots.length > 0,
    ceilings,
    constraints,
    daily,
    totals: {
      httpRequests: sumCounter(snapshots, USAGE_METRICS.httpRequests),
      egressBytes: sumCounter(snapshots, USAGE_METRICS.httpResponseBytes),
      providerCalls: sumCounter(snapshots, USAGE_METRICS.providerCalls),
      mongoCommands: sumCounter(snapshots, USAGE_METRICS.mongoCommands),
      jobRuns: sumCounter(snapshots, USAGE_METRICS.jobRuns),
      jobFailures: sumCounter(snapshots, USAGE_METRICS.jobRuns, { outcome: 'error' }),
      httpLatencyP95Ms: httpLatency.p95Ms,
      httpLatencyP99Ms: httpLatency.p99Ms,
    },
    breakdowns: {
      topRoutesByRequests: toRows(
        groupCounter(snapshots, USAGE_METRICS.httpRequests, 'route'),
        15,
      ),
      topRoutesByEgress: toRows(
        groupCounter(snapshots, USAGE_METRICS.httpResponseBytes, 'route'),
        15,
      ),
      providerCalls: groupCounter(snapshots, USAGE_METRICS.providerCalls, 'provider'),
      fmpEndpoints: toRows(
        groupCounter(snapshots, USAGE_METRICS.providerCalls, 'endpoint', { provider: 'fmp' }),
        15,
      ),
      mongoCommandsByCollection: toRows(
        groupCounter(snapshots, USAGE_METRICS.mongoCommands, 'collection'),
        15,
      ),
      jobsByDuration: toRows(
        groupHistogramSum(snapshots, USAGE_METRICS.jobDuration, 'job'),
        15,
      ),
    },
    current: {
      capturedAt: latest?.capturedAt ?? null,
      mongo: latestDeep?.mongo ?? latest?.mongo ?? null,
      redis: latestDeep?.redis ?? latest?.redis ?? null,
      process: latest?.process ?? null,
      railway: latestDeep?.railway ?? null,
      business: latest?.business ?? null,
    },
    unitEconomics: {
      activeStudents,
      fmpCallsPerStudentPerDay: ratio(fmpPerDay, activeStudents),
      httpRequestsPerStudentPerDay: ratio(requestsPerDay, activeStudents),
      mongoBytesPerStudent: ratio(mongoBytes, activeStudents),
      redisBytesPerStudent: ratio(redisBytes, activeStudents),
      railwayCostPerStudentUsd: ratio(railwayCost, activeStudents),
    },
    projections: projectScale(scalableMetrics, activeStudents ?? 0),
  }
}
