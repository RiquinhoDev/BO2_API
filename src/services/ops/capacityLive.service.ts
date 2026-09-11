// Leitura ao vivo, sem historia. Serve dois casos: os primeiros dias, antes de
// haver snapshots suficientes para uma serie, e a verificacao rapida de "como
// esta isto agora" sem esperar pela hora fechar.
//
// Ao contrario do relatorio, isto corre sondas de verdade — e por isso que tem
// endpoint proprio e nao e o que o painel carrega a cada refrescamento.

import { cacheService } from '../cache.service'
import { loadCapacityCeilings, type CapacityCeilings } from './capacityCeilings'
import {
  createMongoProbePort,
  probeMongoCollections,
  probeMongoTotals,
  type MongoCollectionUsage,
  type MongoStorageTotals,
} from './probes/mongoProbe'
import { probeProcess, type ProcessUsage } from './probes/processProbe'
import { probeRedis, type RedisUsage } from './probes/redisProbe'
import {
  createBusinessProbePort,
  probeBusinessScale,
  type BusinessScale,
} from './probes/businessProbe'

export interface LiveCapacity {
  readonly measuredAt: Date
  readonly ceilings: CapacityCeilings
  readonly mongo: {
    readonly totals: MongoStorageTotals | null
    readonly topCollections: readonly MongoCollectionUsage[] | null
  }
  readonly redis: RedisUsage | null
  readonly process: ProcessUsage
  readonly business: BusinessScale | null
  readonly warnings: readonly string[]
}

export interface LiveCapacityOptions {
  /** Inclui o tamanho por coleccao. Percorre metadados de todas as coleccoes. */
  readonly includeCollections?: boolean
}

export async function probeLiveCapacity(
  options: LiveCapacityOptions = {},
): Promise<LiveCapacity> {
  const warnings: string[] = []
  const mongoPort = createMongoProbePort()

  let totals: MongoStorageTotals | null = null
  try {
    totals = await probeMongoTotals(mongoPort)
  } catch (error) {
    warnings.push(`Mongo indisponivel: ${error instanceof Error ? error.message : 'erro'}`)
  }

  let topCollections: readonly MongoCollectionUsage[] | null = null
  if (options.includeCollections && totals) {
    try {
      topCollections = await probeMongoCollections(mongoPort)
    } catch (error) {
      warnings.push(
        `Detalhe por coleccao indisponivel: ${error instanceof Error ? error.message : 'erro'}`,
      )
    }
  }

  let redis: RedisUsage | null = null
  if (cacheService.isReady()) {
    try {
      redis = await probeRedis(cacheService.getDiagnosticsPort())
    } catch (error) {
      warnings.push(`Redis indisponivel: ${error instanceof Error ? error.message : 'erro'}`)
    }
  } else {
    warnings.push('Redis nao esta ligado nesta instancia')
  }

  let business: BusinessScale | null = null
  try {
    business = await probeBusinessScale(createBusinessProbePort())
  } catch (error) {
    warnings.push(`Escala de negocio indisponivel: ${error instanceof Error ? error.message : 'erro'}`)
  }

  return {
    measuredAt: new Date(),
    ceilings: loadCapacityCeilings(),
    mongo: { totals, topCollections },
    redis,
    process: probeProcess(),
    business,
    warnings,
  }
}
