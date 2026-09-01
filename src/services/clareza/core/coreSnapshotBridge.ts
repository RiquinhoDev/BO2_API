import { createHash } from 'node:crypto'

import type { IClarezaCarteiraItem } from '../../../models/ClarezaCarteiraData'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreGenerationStore } from './coreGeneration.types'
import { evaluateCoreAsset } from './coreAssetEvaluation'
import { buildSectorContext } from './coreEvaluationContext'

interface PublishCarteiraSnapshotInput {
  readonly items: readonly IClarezaCarteiraItem[]
  readonly universe: readonly ClarezaAsset[]
  readonly store: CoreGenerationStore
  readonly now: Date
  readonly universeVersion: string
  readonly complementsByTicker?: ReadonlyMap<string, {
    readonly annualIncome: readonly unknown[]
    readonly earnings: readonly unknown[]
  }>
}

export async function publishCarteiraSnapshot(input: PublishCarteiraSnapshotInput) {
  if (Number.isNaN(input.now.getTime())) throw new RangeError('core snapshot timestamp is invalid')
  if (!input.universeVersion.trim()) throw new RangeError('core universe version is required')
  const normalizedTickers = input.items.map(item => item.ticker.trim().toUpperCase())
  if (new Set(normalizedTickers).size !== normalizedTickers.length) {
    throw new RangeError('Carteira snapshot contains duplicate tickers')
  }
  const universeByTicker = new Map(input.universe.map(asset => [asset.ticker, asset]))
  for (const item of input.items) {
    const asset = universeByTicker.get(item.ticker.trim().toUpperCase())
    if (!asset) throw new RangeError(`Carteira snapshot ticker outside core universe: ${item.ticker}`)
    if (asset.kind !== item.kind) throw new RangeError(`Carteira snapshot kind mismatch: ${item.ticker}`)
  }
  const itemByTicker = new Map(input.items.map(item => [item.ticker.trim().toUpperCase(), item]))
  const baseRecords = input.universe.map(asset => {
    const item = itemByTicker.get(asset.ticker)
    return {
      asset,
      data: item?.data ? { ...item.data } : null,
    }
  })
  const sectorContext = buildSectorContext(baseRecords
    .filter(item => item.asset.kind === 'stock')
    .map(item => ({
      ticker: item.asset.ticker,
      sector: item.asset.sector,
      bucket: item.asset.bucket,
      metrics: {
        pe: item.data?.pe,
        ps: item.data?.ps,
        pb: item.data?.pb,
        evEbitda: item.data?.evEbitda,
        pFfo: item.data?.pFfo,
      },
    })))
  const complements = new Map([...(input.complementsByTicker ?? new Map())]
    .map(([ticker, value]) => [ticker.trim().toUpperCase(), value] as const))
  const records = baseRecords.map(({ asset, data }) => {
    const complement = complements.get(asset.ticker)
    return {
      ticker: asset.ticker,
      kind: asset.kind,
      datasets: {
        data,
        evaluation: asset.kind === 'stock'
          ? evaluateCoreAsset({
          ticker: asset.ticker,
          bucket: asset.bucket,
          sector: asset.sector,
          data: data ?? {},
          }, sectorContext)
          : null,
        'annual-income': complement ? [...complement.annualIncome] : [],
        earnings: complement ? [...complement.earnings] : [],
      },
    }
  })
  const hash = createHash('sha256').update(JSON.stringify(records)).digest('hex')
  const timestamp = input.now.toISOString().replace(/[-:.]/g, '')
  const generationId = `core-${timestamp}-${hash.slice(0, 12)}`
  const current = await input.store.readPublished()
  await input.store.createCandidate({
    generationId,
    universeVersion: input.universeVersion,
    dataVersion: `carteira-sha256:${hash}`,
    createdAt: input.now,
    records,
  })
  return input.store.publishCandidate(generationId, current?.generationId ?? null)
}
