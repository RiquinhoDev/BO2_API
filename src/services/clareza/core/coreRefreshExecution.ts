import { hasCoreMetricsData, type CoreMarketMetrics } from './coreMarketMetrics'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreAssetKind, CoreGenerationStore } from './coreGeneration.types'
import { CoreGenerationBuilder } from './coreGenerationBuilder'
import type {
  CoreCollectionRun,
  CoreCollectionRunStore,
  CoreRunCollectedItem,
} from './coreCollectionRun.types'
import { CoreCollectionRunner } from './coreCollectionRunner'
import type { CoreMasterFetcher, CoreMasterKindCoverage, CoreMasterReport } from './coreMasterCollector'
import {
  executePublicationGate,
  type CoreExecutionMode,
  type CorePublicationPolicy,
} from './corePublicationGate'

interface CoreRefreshExecutionDependencies {
  readonly runStore: CoreCollectionRunStore
  readonly generationStore: CoreGenerationStore
  readonly fetcher: CoreMasterFetcher
  readonly universe: readonly ClarezaAsset[]
  readonly policy: CorePublicationPolicy
  readonly batchSize: number
  readonly leaseMs: number
  readonly builder?: CoreGenerationBuilder
}

export interface ExecuteCoreRefreshInput {
  readonly runId: string
  readonly generationId: string
  readonly universeVersion: string
  readonly ownerId: string
  readonly now: Date
  readonly mode: CoreExecutionMode
  readonly expectedCurrentGenerationId: string | null
}

export interface CoreRefreshExecutionResult {
  readonly status: 'rejected' | 'preview' | 'published' | 'conflict' | 'missing'
  readonly generationId: string
  readonly collectedAssets: number
  readonly missingAssets: number
  readonly failedAssets: number
  readonly reasonCodes: readonly string[]
}

function emptyKindCoverage(): Record<CoreAssetKind, CoreMasterKindCoverage> {
  return {
    stock: { total: 0, available: 0, missing: 0, failed: 0 },
    fund: { total: 0, available: 0, missing: 0, failed: 0 },
    crypto: { total: 0, available: 0, missing: 0, failed: 0 },
  }
}

function increment(
  coverage: CoreMasterKindCoverage,
  status: 'available' | 'missing' | 'failed',
): CoreMasterKindCoverage {
  return { ...coverage, total: coverage.total + 1, [status]: coverage[status] + 1 }
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function decodeData(item: CoreRunCollectedItem | undefined): CoreMarketMetrics | null {
  return item && typeof item.data === 'object' && item.data !== null
    ? item.data as CoreMarketMetrics
    : null
}

export class CoreRefreshExecution {
  private readonly builder: CoreGenerationBuilder

  constructor(private readonly dependencies: CoreRefreshExecutionDependencies) {
    this.builder = dependencies.builder ?? new CoreGenerationBuilder()
    const tickers = dependencies.universe.map(asset => asset.ticker.trim().toUpperCase())
    if (!tickers.length || new Set(tickers).size !== tickers.length) {
      throw new RangeError('core refresh universe requires unique items')
    }
  }

  async execute(input: ExecuteCoreRefreshInput): Promise<CoreRefreshExecutionResult> {
    if (!input.runId.trim() || !input.generationId.trim() || !input.ownerId.trim()) {
      throw new RangeError('core refresh execution identity is required')
    }
    if (Number.isNaN(input.now.getTime())) throw new RangeError('core refresh timestamp is invalid')
    const itemKeys = this.dependencies.universe.map(asset => asset.ticker.trim().toUpperCase())
    const assetByTicker = new Map(this.dependencies.universe.map(asset => [
      asset.ticker.trim().toUpperCase(), asset,
    ]))
    const runner = new CoreCollectionRunner(
      this.dependencies.runStore,
      async key => {
        const asset = assetByTicker.get(key)
        if (!asset) return { status: 'failure', errorCode: 'UNKNOWN_ASSET' }
        const data = await this.dependencies.fetcher.fetchItem(asset)
        return hasCoreMetricsData(data)
          ? { status: 'success', data }
          : { status: 'failure', errorCode: 'DATA_MISSING' }
      },
      { batchSize: this.dependencies.batchSize, leaseMs: this.dependencies.leaseMs },
    )
    let run = await this.dependencies.runStore.read(input.runId)
    if (!run) {
      run = await runner.create({
        runId: input.runId,
        generationId: input.generationId,
        universeVersion: input.universeVersion,
        itemKeys,
        now: input.now,
      })
    }
    this.assertRunIdentity(run, input, itemKeys)
    while (run.status !== 'completed') {
      run = await runner.executeNext(input.runId, input.ownerId, input.now)
    }

    const master = this.masterReport(run, assetByTicker)
    const built = this.builder.build({
      master,
      now: input.now,
      universeVersion: input.universeVersion,
      generationId: input.generationId,
    })
    if (input.mode === 'publish'
      && !await this.dependencies.generationStore.readCandidate(input.generationId)) {
      await this.dependencies.generationStore.createCandidate(built.candidate)
    }
    const gate = await executePublicationGate({
      report: built.report,
      policy: this.dependencies.policy,
      now: input.now,
      mode: input.mode,
      expectedCurrentGenerationId: input.expectedCurrentGenerationId,
      publisher: this.dependencies.generationStore,
    })
    return {
      status: gate.status,
      generationId: input.generationId,
      collectedAssets: master.coverage.available,
      missingAssets: master.coverage.missing,
      failedAssets: master.coverage.failed,
      reasonCodes: gate.reasonCodes,
    }
  }

  private assertRunIdentity(
    run: CoreCollectionRun,
    input: ExecuteCoreRefreshInput,
    itemKeys: readonly string[],
  ): void {
    if (run.generationId !== input.generationId
      || run.universeVersion !== input.universeVersion
      || !sameItems(run.itemKeys, itemKeys)) {
      throw new Error('core refresh persisted execution identity mismatch')
    }
  }

  private masterReport(
    run: CoreCollectionRun,
    assetByTicker: ReadonlyMap<string, ClarezaAsset>,
  ): CoreMasterReport {
    const collected = new Map(run.collectedItems.map(item => [item.key, item]))
    const failures = new Map(run.failedItems.map(item => [item.key, item.errorCode]))
    const byKind = emptyKindCoverage()
    let available = 0
    let missing = 0
    let failed = 0
    const records = run.itemKeys.map(key => {
      const asset = assetByTicker.get(key)
      if (!asset) throw new Error(`core refresh contains unknown persisted asset ${key}`)
      const data = decodeData(collected.get(key))
      const error = failures.get(key)
      if (data) {
        available += 1
        byKind[asset.kind] = increment(byKind[asset.kind], 'available')
        return { asset, status: 'available' as const, data }
      }
      if (error === 'DATA_MISSING') {
        missing += 1
        byKind[asset.kind] = increment(byKind[asset.kind], 'missing')
        return { asset, status: 'missing' as const, data: null }
      }
      failed += 1
      byKind[asset.kind] = increment(byKind[asset.kind], 'failed')
      return { asset, status: 'failed' as const, data: null, errorCode: error ?? 'CHECKPOINT_MISSING' }
    })
    return {
      records,
      coverage: { total: records.length, available, missing, failed, byKind },
    }
  }
}
