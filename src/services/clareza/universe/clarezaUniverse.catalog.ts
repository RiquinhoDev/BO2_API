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
  snapshotDate: '2026-09-03',
  sha256: '78c7f9b842e7abf912bdf8a1f6086c945eef3debbdabff1b8a1b2e14a22d7f47',
})

// Ativos presentes no snapshot PHP que ficam de fora até a fonte ser corrigida.
// Os ficheiros em data/ continuam a espelhar o PHP linha a linha, para que a
// próxima atualização do universo continue a ser um diff limpo.
//
// MYTKY (Magyar Telekom): não existe na FMP. A FMP cobre sete empresas da bolsa
// de Budapeste (OTP.BD, MOL.BD, RICHT.BD, 4IG.BD, OPUS.BD, ZWACK.BD,
// MASTERPLAST.BD) e a Magyar Telekom não é uma delas. O único registo é o ADR
// OTC MYTAY, que devolve preço em USD contra financeiras em HUF e a contagem de
// ações do ADR: dá P/E 0,32 e um DCF 90x acima do preço, ou seja, entraria no
// Radar como a ação mais barata do universo. Sem dados é melhor do que com
// dados errados.
export const CLAREZA_UNIVERSE_EXCLUSIONS: readonly string[] = Object.freeze(['MYTKY'])

const excluded = new Set(CLAREZA_UNIVERSE_EXCLUSIONS)

const parsedUniverse = ClarezaUniverseSchema.parse([
  ...stockAssets,
  ...fundAssetsPart1,
  ...fundAssetsPart2,
  ...cryptoAssets,
])

export const CLAREZA_UNIVERSE: readonly ClarezaAsset[] = Object.freeze(
  parsedUniverse
    .filter((asset) => !excluded.has(asset.ticker))
    .map((asset) => Object.freeze(asset)),
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
