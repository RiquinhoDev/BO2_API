// ═══════════════════════════════════════════════════════════════════════════
// 📊 MODEL: UsageRollup — o consumo já resumido, por dia e por semana
// ═══════════════════════════════════════════════════════════════════════════
// Os snapshots horários são detalhados e morrem depressa (14 dias). Aqui fica
// o que sobrevive: um documento por dia durante um ano, um por semana para
// sempre. Ler 90 dias passa a custar 90 documentos em vez de 2160, e um ano
// custa 52.
//
// Cada resumo guarda média E pico. Só a média mentia: uma semana com seis dias
// calmos e um pico de seis horas tem média baixa, e é o pico que rebenta o
// tecto.
// ═══════════════════════════════════════════════════════════════════════════

import mongoose, { Schema, type Document } from 'mongoose'

export type UsagePeriod = 'day' | 'week'

/** Os mesmos nomes da série diária do painel, para o Front não ter dois dialectos. */
export interface IUsageRollupPoint {
  httpRequests: number
  httpErrors: number
  httpServerErrors: number
  httpLatencyP95Ms: number | null
  egressBytes: number
  providerCalls: number
  fmpCalls: number
  fmpRateLimited: number
  fmpDeduplicated: number
  mongoCommands: number
  mongoTotalBytes: number | null
  mongoCountedBytes: number | null
  redisUsedBytesPeak: number | null
  redisEvictedKeys: number | null
  redisHitRate: number | null
  cacheHits: number
  cacheMisses: number
  jobRuns: number
  jobFailures: number
  rssBytesPeak: number | null
  eventLoopP99MsPeak: number | null
  students: number | null
  activeStudents: number | null
  /** Reinícios do processo detectados no período. */
  processRestarts: number
}

export interface IUsageRollup extends Document {
  period: UsagePeriod
  /** "2026-09-11" para dia, "2026-W37" para semana. */
  key: string
  from: Date
  to: Date
  /** Dias com dados que entraram neste resumo. Uma semana incompleta tem menos de 7. */
  days: number
  /** Valores médios por dia (num resumo diário, os do próprio dia). */
  average: IUsageRollupPoint
  /** Maior valor diário do período. Num resumo diário, igual a `average`. */
  peak: IUsageRollupPoint
  /** Dia em que o pico de chamadas FMP aconteceu, quando há mais do que um dia. */
  peakDay: string | null
  /** Só os resumos diários expiram; nos semanais fica por preencher. */
  expiresAt?: Date | null
}

const PointSchema = new Schema<IUsageRollupPoint>(
  {
    httpRequests: { type: Number, default: 0 },
    httpErrors: { type: Number, default: 0 },
    httpServerErrors: { type: Number, default: 0 },
    httpLatencyP95Ms: { type: Number, default: null },
    egressBytes: { type: Number, default: 0 },
    providerCalls: { type: Number, default: 0 },
    fmpCalls: { type: Number, default: 0 },
    fmpRateLimited: { type: Number, default: 0 },
    fmpDeduplicated: { type: Number, default: 0 },
    mongoCommands: { type: Number, default: 0 },
    mongoTotalBytes: { type: Number, default: null },
    mongoCountedBytes: { type: Number, default: null },
    redisUsedBytesPeak: { type: Number, default: null },
    redisEvictedKeys: { type: Number, default: null },
    redisHitRate: { type: Number, default: null },
    cacheHits: { type: Number, default: 0 },
    cacheMisses: { type: Number, default: 0 },
    jobRuns: { type: Number, default: 0 },
    jobFailures: { type: Number, default: 0 },
    rssBytesPeak: { type: Number, default: null },
    eventLoopP99MsPeak: { type: Number, default: null },
    students: { type: Number, default: null },
    activeStudents: { type: Number, default: null },
    processRestarts: { type: Number, default: 0 },
  },
  { _id: false },
)

const UsageRollupSchema = new Schema<IUsageRollup>(
  {
    period: { type: String, required: true, enum: ['day', 'week'] },
    key: { type: String, required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    days: { type: Number, required: true },
    average: { type: PointSchema, required: true },
    peak: { type: PointSchema, required: true },
    peakDay: { type: String, default: null },
    // Só os resumos diários expiram. O TTL do Mongo age sobre este campo, e
    // deixá-lo por preencher nos semanais é o que os torna permanentes.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'usagerollups' },
)

UsageRollupSchema.index({ period: 1, key: 1 }, { unique: true })
UsageRollupSchema.index({ period: 1, from: -1 })
UsageRollupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const UsageRollup: mongoose.Model<IUsageRollup> =
  mongoose.models.UsageRollup
  || mongoose.model<IUsageRollup>('UsageRollup', UsageRollupSchema)

export default UsageRollup
