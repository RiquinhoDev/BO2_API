import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import { CarteiraMetricsFetcher, type Clock } from '../carteira/carteiraMetrics'
import type { FmpCarteiraClient } from '../carteira/fmpCarteiraClient'
import { clarezaFmpJsonClient } from '../fmpJsonRuntime'
import { FMP_STABLE_BASE_URL } from '../fmpJsonClient'
import { CoreMasterCollector, type CoreMasterReport } from './coreMasterCollector'

const DEFAULT_CONCURRENCY = 12
const clock: Clock = { now: () => new Date() }

function firstObject<T extends object>(data: unknown): T | null {
  const first = Array.isArray(data) ? data[0] : data
  if (first === null || first === undefined) return null
  if (typeof first !== 'object' || 'Error Message' in first) {
    throw Object.assign(new Error('FMP returned an invalid core master response'), {
      code: 'FMP_INVALID_RESPONSE',
    })
  }
  return first as T
}

const strictClient: FmpCarteiraClient = {
  async fetch<T extends object>(
    path: string,
    params: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<T | null> {
    const data = await clarezaFmpJsonClient.getOrThrow({
      baseUrl: FMP_STABLE_BASE_URL,
      path,
      params,
      ...(signal ? { signal } : {}),
    })
    return firstObject<T>(data)
  },
}

export interface CoreMasterRuntimeDependencies {
  readonly client: FmpCarteiraClient
  readonly clock: Clock
  readonly universe: readonly ClarezaAsset[]
  readonly concurrency: number
}

export function createCoreMasterCollector(
  dependencies: CoreMasterRuntimeDependencies,
): CoreMasterCollector {
  return new CoreMasterCollector(
    new CarteiraMetricsFetcher(dependencies.client, dependencies.clock),
    dependencies.universe,
    { concurrency: dependencies.concurrency },
  )
}

let collector: CoreMasterCollector | null = null

export function collectCoreMasterData(): Promise<CoreMasterReport> {
  collector ??= createCoreMasterCollector({
    client: strictClient,
    clock,
    universe: CLAREZA_UNIVERSE,
    concurrency: DEFAULT_CONCURRENCY,
  })
  return collector.collect()
}
