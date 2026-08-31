import stockAssets from './data/stock.json'
import fundAssetsPart1 from './data/fund-1.json'
import fundAssetsPart2 from './data/fund-2.json'
import cryptoAssets from './data/crypto.json'
import {
  ClarezaUniverseSchema,
  type ClarezaAsset,
  type ClarezaEditorialResolution,
} from './clarezaUniverse.types'

export const CLAREZA_UNIVERSE_SOURCE = Object.freeze({
  snapshotDate: '2026-08-31',
  sha256: '6f2ea6eed958276178d2b64347ecfb7056b051feff428639d532d106149707dc',
})

const parsedUniverse = ClarezaUniverseSchema.parse([
  ...stockAssets,
  ...fundAssetsPart1,
  ...fundAssetsPart2,
  ...cryptoAssets,
])

export const CLAREZA_UNIVERSE: readonly ClarezaAsset[] = Object.freeze(
  parsedUniverse.map((asset) => Object.freeze(asset)),
)

function selectStocks(universe: readonly ClarezaAsset[]): readonly ClarezaAsset[] {
  return universe.filter((asset) => asset.kind === 'stock')
}

function selectOperatingStocks(universe: readonly ClarezaAsset[]): readonly ClarezaAsset[] {
  return universe.filter((asset) => asset.kind === 'stock' && asset.type !== 'reit')
}

export function selectRadarUniverse(
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): readonly ClarezaAsset[] {
  return selectStocks(universe)
}

export function selectEarningsUniverse(
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): readonly ClarezaAsset[] {
  return selectStocks(universe)
}

export function selectRaioxUniverse(
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): readonly ClarezaAsset[] {
  return selectOperatingStocks(universe)
}

export function selectComparadorUniverse(
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): readonly ClarezaAsset[] {
  return selectOperatingStocks(universe)
}

export function selectPortfolioUniverse(
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): readonly ClarezaAsset[] {
  return universe
}

export function resolveEditorialUniverse(
  tickers: readonly string[],
  universe: readonly ClarezaAsset[] = CLAREZA_UNIVERSE,
): ClarezaEditorialResolution {
  const byTicker = new Map(universe.map((asset) => [asset.ticker, asset]))
  const assets: ClarezaAsset[] = []
  const missing: string[] = []

  for (const value of tickers) {
    const ticker = value.trim().toUpperCase()
    const asset = byTicker.get(ticker)
    if (asset) assets.push(asset)
    else missing.push(ticker)
  }

  return { assets, missing }
}
