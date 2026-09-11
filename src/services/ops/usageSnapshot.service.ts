// Fecha uma hora: pega nos contadores que as replicas somaram no Redis, junta
// as fotografias de estado (Mongo, Redis, processo, negocio) e grava um unico
// documento. Depois disto o painel nunca mais precisa de tocar no Redis.
//
// Cada sonda esta isolada: se a Mongo responder e o Railway nao, fica gravado o
// que ha. Meia fotografia por hora vale muito mais do que um buraco na serie.

import logger from '../../utils/logger'
import UsageSnapshot, { type IUsageSnapshot } from '../../models/UsageSnapshot'
import { cacheService } from '../cache.service'
import {
  dropUsageHour,
  readUsageHour,
  type UsageStoreCommandPort,
} from '../../observability/usage/usageStore'
import {
  createMongoProbePort,
  probeMongoCollections,
  probeMongoTotals,
  type MongoProbePort,
} from './probes/mongoProbe'
import { probeRedis, probeRedisPrefixes } from './probes/redisProbe'
import { probeProcess } from './probes/processProbe'
import { probeRailway, type RailwayProbeResult } from './probes/railwayProbe'
import {
  createDeadDataProbePort,
  probeDeadData,
  type DeadDataReport,
} from './probes/deadDataProbe'
import {
  createBusinessProbePort,
  probeBusinessScale,
  type BusinessProbePort,
} from './probes/businessProbe'
import type { RedisDiagnosticsPort } from '../cache.service'
import { getOptionalRailwaySettings } from '../requestDrivenRuntimeConfig'

/** Familias de chaves que queremos ver pesadas separadamente no painel. */
export const REDIS_TRACKED_PREFIXES = [
  'clareza:core:',
  'clareza:',
  'users:',
  'analytics:',
  'dashboard:',
  'rate-limit:',
  'usage:',
] as const

export interface UsageSnapshotDependencies {
  readonly usageStore: () => UsageStoreCommandPort | null
  readonly redisDiagnostics: () => RedisDiagnosticsPort | null
  readonly mongoProbe: () => MongoProbePort
  readonly businessProbe: () => BusinessProbePort
  readonly railway: () => { token: string; projectId: string } | null
  readonly now: () => Date
}

export const defaultUsageSnapshotDependencies: UsageSnapshotDependencies = {
  usageStore: () => (cacheService.isReady() ? cacheService.getUsageStoreCommandPort() : null),
  redisDiagnostics: () => (cacheService.isReady() ? cacheService.getDiagnosticsPort() : null),
  mongoProbe: createMongoProbePort,
  businessProbe: createBusinessProbePort,
  railway: () => getOptionalRailwaySettings() ?? null,
  now: () => new Date(),
}

async function attempt<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch (error) {
    logger.warn(`Sonda de consumo falhou: ${label}`, { error })
    return null
  }
}

/** Hora UTC anterior a `now` — a ultima que ja nao recebe escritas novas. */
export function previousHour(now: Date): string {
  return new Date(now.getTime() - 60 * 60 * 1_000).toISOString().slice(0, 13)
}

export interface CaptureOptions {
  /** Hora a fechar. Por omissao, a anterior a atual. */
  readonly hour?: string
  /**
   * Inclui o detalhe caro: tamanho por coleccao, peso por prefixo de Redis e
   * consumo facturado no Railway. Uma vez por dia chega.
   */
  readonly deep?: boolean
}

export async function captureUsageSnapshot(
  options: CaptureOptions = {},
  dependencies: UsageSnapshotDependencies = defaultUsageSnapshotDependencies,
): Promise<IUsageSnapshot | null> {
  const now = dependencies.now()
  const hour = options.hour ?? previousHour(now)
  const deep = options.deep ?? false

  const store = dependencies.usageStore()
  const diagnostics = dependencies.redisDiagnostics()
  const mongoPort = dependencies.mongoProbe()

  const readout = store
    ? await attempt('contadores Redis', () => readUsageHour(store, hour))
    : null

  const mongoTotals = await attempt('mongo dbStats', () => probeMongoTotals(mongoPort))
  const topCollections = deep && mongoTotals
    ? await attempt('mongo collStats', () => probeMongoCollections(mongoPort))
    : null

  // Só faz sentido perguntar "isto é lixo?" às colecções que pesam. Perfilar as
  // noventa e seis, incluindo as vazias, custava sem devolver nada.
  const deadData: DeadDataReport | null = deep && topCollections
    ? await attempt('dados mortos', () =>
        probeDeadData(
          createDeadDataProbePort(mongoPort),
          topCollections.slice(0, 10).map((collection) => collection.name),
          now,
        ))
    : null

  const redisUsage = diagnostics
    ? await attempt('redis INFO', () => probeRedis(diagnostics))
    : null
  const topPrefixes = deep && diagnostics
    ? await attempt('redis prefixos', () =>
        probeRedisPrefixes(diagnostics, REDIS_TRACKED_PREFIXES))
    : null

  const railwayConfig = deep ? dependencies.railway() : null
  const railway: RailwayProbeResult | null = railwayConfig
    ? await attempt('railway usage', () => probeRailway(railwayConfig, undefined, now))
    : null

  const business = await attempt('escala de negocio', () =>
    probeBusinessScale(dependencies.businessProbe(), now))

  const document = {
    hour,
    capturedAt: now,
    deep,
    counters: (readout?.counters ?? []).map((entry) => ({
      metric: entry.metric,
      labels: { ...entry.labels },
      value: entry.value,
    })),
    histograms: (readout?.histograms ?? []).map((entry) => ({
      metric: entry.metric,
      labels: { ...entry.labels },
      count: entry.count,
      sumMs: entry.sumMs,
      buckets: [...entry.buckets],
    })),
    ...(mongoTotals
      ? { mongo: { ...mongoTotals, ...(topCollections ? { topCollections } : {}) } }
      : {}),
    ...(redisUsage
      ? { redis: { ...redisUsage, ...(topPrefixes ? { topPrefixes } : {}) } }
      : {}),
    process: probeProcess(),
    ...(railway
      ? {
          railway: railway.available
            ? {
                available: true,
                periodStart: railway.periodStart,
                periodEnd: railway.periodEnd,
                estimatedCostUsd: railway.estimatedCostUsd,
                measurements: [...railway.measurements],
              }
            : { available: false, reason: railway.reason },
        }
      : {}),
    ...(deadData ? { deadData } : {}),
    ...(business
      ? {
          business: {
            students: business.students,
            activeStudents: business.activeStudents,
            enrollments: business.enrollments,
            activeProducts: business.activeProducts,
          },
        }
      : {}),
  }

  const saved = await attempt('gravar snapshot', () =>
    UsageSnapshot.findOneAndUpdate({ hour }, document, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).exec())

  // So apagamos o balde do Redis depois de o ter em Mongo. Se a gravacao
  // falhou, o balde fica e a proxima passagem tenta outra vez.
  if (saved && store) {
    await attempt('limpar balde Redis', () => dropUsageHour(store, hour))
  }

  return saved
}
