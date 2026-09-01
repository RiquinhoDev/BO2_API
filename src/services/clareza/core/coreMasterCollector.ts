import type { IClarezaCarteiraMetrics } from '../../../models/ClarezaCarteiraData'
import { hasCoreMetricsData } from '../carteira/carteiraMetrics'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreAssetKind } from './coreGeneration.types'

export interface CoreMasterFetcher {
  fetchItem(asset: ClarezaAsset): Promise<IClarezaCarteiraMetrics>
}

export type CoreMasterRecord =
  | { readonly asset: ClarezaAsset; readonly status: 'available'; readonly data: IClarezaCarteiraMetrics }
  | { readonly asset: ClarezaAsset; readonly status: 'missing'; readonly data: null }
  | { readonly asset: ClarezaAsset; readonly status: 'failed'; readonly data: null; readonly errorCode: string }

export interface CoreMasterKindCoverage {
  readonly total: number
  readonly available: number
  readonly missing: number
  readonly failed: number
}

export interface CoreMasterCoverage extends CoreMasterKindCoverage {
  readonly byKind: Readonly<Record<CoreAssetKind, CoreMasterKindCoverage>>
}

export interface CoreMasterReport {
  readonly records: readonly CoreMasterRecord[]
  readonly coverage: CoreMasterCoverage
}

interface CoreMasterCollectorOptions {
  readonly concurrency: number
}

function emptyCoverage(): Record<CoreAssetKind, CoreMasterKindCoverage> {
  return {
    stock: { total: 0, available: 0, missing: 0, failed: 0 },
    fund: { total: 0, available: 0, missing: 0, failed: 0 },
    crypto: { total: 0, available: 0, missing: 0, failed: 0 },
  }
}

function increment(
  coverage: CoreMasterKindCoverage,
  status: CoreMasterRecord['status'],
): CoreMasterKindCoverage {
  return {
    ...coverage,
    total: coverage.total + 1,
    [status]: coverage[status] + 1,
  }
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code
    if (typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(code)) return code
  }
  return 'CORE_MASTER_FETCH_FAILED'
}

export class CoreMasterCollector {
  constructor(
    private readonly fetcher: CoreMasterFetcher,
    private readonly universe: readonly ClarezaAsset[],
    private readonly options: CoreMasterCollectorOptions,
  ) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 100) {
      throw new RangeError('core master concurrency must be an integer between 1 and 100')
    }
    const tickers = universe.map(asset => asset.ticker.trim().toUpperCase())
    if (tickers.some(ticker => !ticker) || new Set(tickers).size !== tickers.length) {
      throw new RangeError('core master universe requires unique tickers')
    }
  }

  async collect(): Promise<CoreMasterReport> {
    const records = new Array<CoreMasterRecord>(this.universe.length)
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < this.universe.length) {
        const index = nextIndex++
        const asset = this.universe[index]
        try {
          const data = await this.fetcher.fetchItem(asset)
          records[index] = hasCoreMetricsData(data)
            ? { asset, status: 'available', data }
            : { asset, status: 'missing', data: null }
        } catch (error: unknown) {
          records[index] = { asset, status: 'failed', data: null, errorCode: errorCode(error) }
        }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(this.options.concurrency, this.universe.length) },
      worker,
    ))

    const byKind = emptyCoverage()
    let available = 0
    let missing = 0
    let failed = 0
    for (const record of records) {
      byKind[record.asset.kind] = increment(byKind[record.asset.kind], record.status)
      if (record.status === 'available') available += 1
      else if (record.status === 'missing') missing += 1
      else failed += 1
    }
    return {
      records,
      coverage: {
        total: records.length,
        available,
        missing,
        failed,
        byKind,
      },
    }
  }
}
