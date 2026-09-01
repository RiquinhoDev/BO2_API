import { CLAREZA_UNIVERSE } from '../universe/clarezaUniverse.catalog'
import type { ClarezaAsset } from '../universe/clarezaUniverse.types'

export type CarteiraKind = ClarezaAsset['kind']
export type CarteiraUniverseItem = Pick<ClarezaAsset, 'ticker' | 'name' | 'type' | 'sector'>
export type CarteiraItem = CarteiraUniverseItem & Pick<ClarezaAsset, 'kind'>

// Compatibility views derived from the single canonical catalog. They contain
// no independent data and can be removed when their remaining imports migrate.
export const STOCK_UNIVERSE = CLAREZA_UNIVERSE.filter((item) => item.kind === 'stock')
export const FUND_UNIVERSE = CLAREZA_UNIVERSE.filter((item) => item.kind === 'fund')
export const CRYPTO_UNIVERSE = CLAREZA_UNIVERSE.filter((item) => item.kind === 'crypto')
export const UNIVERSE: readonly CarteiraItem[] = CLAREZA_UNIVERSE
