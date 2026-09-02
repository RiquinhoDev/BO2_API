import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import type { CoreClock as Clock } from './coreMarketMetrics'
import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { CoreMasterCollector, type CoreMasterReport } from './coreMasterCollector'
import { CoreMasterMetricsFetcher, type CoreMasterFmpPort } from './coreMasterMetrics'

const DEFAULT_CONCURRENCY = 12
const clock: Clock = { now: () => new Date() }

function assertValidResponse(data: unknown): unknown {
  const first = Array.isArray(data) ? data[0] : data
  if (typeof first === 'object' && first !== null && 'Error Message' in first) {
    throw Object.assign(new Error('FMP returned an invalid core master response'), {
      code: 'FMP_INVALID_RESPONSE',
    })
  }
  return data
}

const strictFmp: CoreMasterFmpPort = {
  async get(
    path: string,
    params: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const data = await clarezaFmpJsonClient.getOrThrow({
      baseUrl: FMP_STABLE_BASE_URL,
      path,
      params,
    })
    return assertValidResponse(data)
  },
}

export interface CoreMasterRuntimeDependencies {
  readonly fmp: CoreMasterFmpPort
  readonly clock: Clock
  readonly universe: readonly ClarezaAsset[]
  readonly concurrency: number
}

export function createCoreMasterCollector(
  dependencies: CoreMasterRuntimeDependencies,
): CoreMasterCollector {
  return new CoreMasterCollector(
    new CoreMasterMetricsFetcher(dependencies.fmp, dependencies.clock),
    dependencies.universe,
    { concurrency: dependencies.concurrency },
  )
}

export function createCoreMasterFetcher(): CoreMasterMetricsFetcher {
  return new CoreMasterMetricsFetcher(strictFmp, clock)
}

let collector: CoreMasterCollector | null = null

export function collectCoreMasterData(): Promise<CoreMasterReport> {
  collector ??= createCoreMasterCollector({
    fmp: strictFmp,
    clock,
    universe: CLAREZA_UNIVERSE,
    concurrency: DEFAULT_CONCURRENCY,
  })
  return collector.collect()
}
