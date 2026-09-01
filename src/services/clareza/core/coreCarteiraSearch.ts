import type { CoreAssetKind } from './coreGeneration.types'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreCarteiraSearchAsset {
  readonly ticker: string
  readonly name: string
  readonly kind: CoreAssetKind
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly data: JsonRecord | null
}

export interface CoreCarteiraSearchAlias {
  readonly aliasTicker: string
  readonly canonicalTicker: string
}

export interface CoreCarteiraSearchResult {
  readonly ticker: string
  readonly name: string
  readonly type: 'growth' | 'value' | 'reit' | 'etf' | 'cripto'
  readonly kind: CoreAssetKind
  readonly currency: string | null
  readonly via_alias: string | null
}

export interface CoreCarteiraSearchResponse {
  readonly query: string
  readonly count: number
  readonly results: readonly CoreCarteiraSearchResult[]
}

const normalize = (value: string): string => value.trim().toUpperCase()
const currencyOf = (data: JsonRecord | null): string | null => (
  typeof data?.currency === 'string' ? data.currency : null
)

export function searchCoreCarteira(
  rawQuery: string,
  assets: readonly CoreCarteiraSearchAsset[],
  aliases: readonly CoreCarteiraSearchAlias[],
  limit = 25,
): CoreCarteiraSearchResponse {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new RangeError('Carteira search limit must be between 1 and 25')
  }
  const query = normalize(rawQuery)
  const assetByTicker = new Map(assets.map(asset => [normalize(asset.ticker), asset]))
  const ranked = new Map<string, { rank: number; result: CoreCarteiraSearchResult }>()
  const put = (asset: CoreCarteiraSearchAsset, rank: number, viaAlias: string | null): void => {
    const ticker = normalize(asset.ticker)
    const current = ranked.get(ticker)
    if (current && current.rank <= rank) return
    ranked.set(ticker, {
      rank,
      result: {
        ticker,
        name: asset.name,
        type: asset.type,
        kind: asset.kind,
        currency: currencyOf(asset.data),
        via_alias: viaAlias,
      },
    })
  }
  for (const asset of assets) {
    const ticker = normalize(asset.ticker)
    const name = normalize(asset.name)
    if (!query) put(asset, 4, null)
    else if (ticker === query) put(asset, 0, null)
    else if (ticker.startsWith(query)) put(asset, 1, null)
    else if (name.startsWith(query)) put(asset, 2, null)
    else if (ticker.includes(query) || name.includes(query)) put(asset, 3, null)
  }
  if (query) {
    const targetsByAlias = new Map<string, Set<string>>()
    for (const alias of aliases) {
      const aliasTicker = normalize(alias.aliasTicker)
      const canonicalTicker = normalize(alias.canonicalTicker)
      if (!aliasTicker || assetByTicker.has(aliasTicker) || !assetByTicker.has(canonicalTicker)) continue
      const targets = targetsByAlias.get(aliasTicker) ?? new Set<string>()
      targets.add(canonicalTicker)
      targetsByAlias.set(aliasTicker, targets)
    }
    for (const [aliasTicker, targets] of [...targetsByAlias].sort(([left], [right]) => left.localeCompare(right))) {
      if (targets.size !== 1 || !aliasTicker.startsWith(query)) continue
      const canonicalTicker = [...targets][0]
      const asset = assetByTicker.get(canonicalTicker)
      if (asset) put(asset, aliasTicker === query ? 1.25 : 1.5, aliasTicker)
    }
  }
  const results = [...ranked.values()]
    .sort((left, right) => left.rank - right.rank || left.result.ticker.localeCompare(right.result.ticker))
    .slice(0, limit)
    .map(item => item.result)
  return { query, count: results.length, results }
}
