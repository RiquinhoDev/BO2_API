// Canonical Clareza Carteira universe: static catalog data (the stock/fund/crypto
// JSON files) assembled into a typed list. Data only — no I/O, no logic.
import stockUniverse from './stockUniverse.json'
import fundUniverse from './fundUniverse.json'
import cryptoUniverse from './cryptoUniverse.json'

export type CarteiraKind = 'stock' | 'fund' | 'crypto'
export type CarteiraUniverseItem = { ticker: string; name: string; type: string; sector: string }
export type CarteiraItem = CarteiraUniverseItem & { kind: CarteiraKind }

export const STOCK_UNIVERSE = stockUniverse as CarteiraUniverseItem[]
export const FUND_UNIVERSE = fundUniverse as CarteiraUniverseItem[]
export const CRYPTO_UNIVERSE = cryptoUniverse as CarteiraUniverseItem[]

export const UNIVERSE: CarteiraItem[] = [
  ...STOCK_UNIVERSE.map((item) => ({ ...item, kind: 'stock' as const })),
  ...FUND_UNIVERSE.map((item) => ({ ...item, kind: 'fund' as const })),
  ...CRYPTO_UNIVERSE.map((item) => ({ ...item, kind: 'crypto' as const })),
]
