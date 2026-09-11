// ═══════════════════════════════════════════════════════════════════════════
// 📊 MODEL: UsageSnapshot — uma fotografia de consumo por hora
// ═══════════════════════════════════════════════════════════════════════════
// Escrito pelo cron horario a partir dos contadores agregados no Redis. E a
// unica fonte que o painel de capacidade le: uma query indexada por intervalo,
// sem tocar no Redis nem em probes caros no caminho do utilizador.
//
// Um documento por hora, ~2KB. Um ano de historia cabe em cerca de 18MB, o que
// e ordens de grandeza menos do que aquilo que se esta a medir.
// ═══════════════════════════════════════════════════════════════════════════

import mongoose, { Schema, type Document } from 'mongoose'

export interface IUsageCounterSample {
  metric: string
  labels: Record<string, string>
  value: number
}

export interface IUsageHistogramSample {
  metric: string
  labels: Record<string, string>
  count: number
  sumMs: number
  buckets: number[]
}

export interface IUsageSnapshot extends Document {
  /** Hora UTC fechada a que a fotografia diz respeito, ex.: "2026-09-11T14". */
  hour: string
  capturedAt: Date
  /** Verdadeiro no snapshot diario, o unico que traz o detalhe caro. */
  deep: boolean

  counters: IUsageCounterSample[]
  histograms: IUsageHistogramSample[]

  mongo?: {
    dataSizeBytes: number
    storageSizeBytes: number
    indexSizeBytes: number
    totalSizeBytes: number
    countedSizeBytes?: number
    objects: number
    collections: number
    indexes: number
    topCollections?: Array<{
      name: string
      documents: number
      dataSizeBytes: number
      storageSizeBytes: number
      indexSizeBytes: number
      averageObjectSizeBytes: number
    }>
  }

  redis?: {
    usedMemoryBytes: number
    usedMemoryRssBytes: number
    maxMemoryBytes: number
    maxMemoryPolicy: string
    fragmentationRatio: number
    keys: number
    connectedClients: number
    uptimeSeconds: number
    evictedKeys: number
    expiredKeys: number
    keyspaceHits: number
    keyspaceMisses: number
    totalCommands: number
    topPrefixes?: Array<{
      prefix: string
      sampledKeys: number
      sampledBytes: number
      estimatedBytes: number
      totalKeys: number
    }>
  }

  process?: {
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
    heapLimitBytes: number
    externalBytes: number
    systemMemoryUsedBytes: number
    systemMemoryTotalBytes: number
    loadAverage1m: number
    cpuCount: number
    uptimeSeconds: number
    eventLoopDelayP50Ms: number
    eventLoopDelayP99Ms: number
  }

  railway?: {
    available: boolean
    reason?: string
    periodStart?: string
    periodEnd?: string
    estimatedCostUsd?: number | null
    measurements?: Array<{ measurement: string; value: number }>
  }

  business?: {
    students: number
    activeStudents: number | null
    enrollments: number
    activeProducts: number | null
  }
}

const CounterSampleSchema = new Schema<IUsageCounterSample>(
  {
    metric: { type: String, required: true },
    labels: { type: Schema.Types.Mixed, default: {} },
    value: { type: Number, required: true },
  },
  { _id: false },
)

const HistogramSampleSchema = new Schema<IUsageHistogramSample>(
  {
    metric: { type: String, required: true },
    labels: { type: Schema.Types.Mixed, default: {} },
    count: { type: Number, required: true },
    sumMs: { type: Number, required: true },
    buckets: { type: [Number], default: [] },
  },
  { _id: false },
)

const UsageSnapshotSchema = new Schema<IUsageSnapshot>(
  {
    hour: { type: String, required: true, unique: true },
    capturedAt: { type: Date, required: true },
    deep: { type: Boolean, default: false },
    counters: { type: [CounterSampleSchema], default: [] },
    histograms: { type: [HistogramSampleSchema], default: [] },
    mongo: { type: Schema.Types.Mixed },
    redis: { type: Schema.Types.Mixed },
    process: { type: Schema.Types.Mixed },
    railway: { type: Schema.Types.Mixed },
    business: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'usagesnapshots' },
)

UsageSnapshotSchema.index({ capturedAt: -1 })
// Catorze dias. Este e o degrau detalhado da escada: serve para investigar a
// semana em curso. A memoria longa fica nos UsageRollup, que custam um
// documento por dia e um por semana em vez de vinte e quatro por dia.
UsageSnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 })

export const UsageSnapshot: mongoose.Model<IUsageSnapshot> =
  mongoose.models.UsageSnapshot
  || mongoose.model<IUsageSnapshot>('UsageSnapshot', UsageSnapshotSchema)

export default UsageSnapshot
