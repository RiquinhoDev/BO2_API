import {
  CRYPTO_UNIVERSE,
  FUND_UNIVERSE,
  STOCK_UNIVERSE,
  UNIVERSE,
} from '../../../src/services/clareza/carteira/carteiraUniverse'

// Guards the canonical Carteira catalog data after it was moved out of code into
// JSON. Doubles as the dead-data audit: the catalogs must stay unique, valid,
// and completely typed — no duplicates, no malformed tickers, no empty fields.
describe('Carteira universe data', () => {
  it('keeps the expected catalog sizes', () => {
    expect(STOCK_UNIVERSE).toHaveLength(205)
    expect(FUND_UNIVERSE).toHaveLength(511)
    expect(CRYPTO_UNIVERSE).toHaveLength(15)
    expect(UNIVERSE).toHaveLength(731)
  })

  it('assigns the correct kind per source catalog', () => {
    expect(UNIVERSE.filter((i) => i.kind === 'stock')).toHaveLength(205)
    expect(UNIVERSE.filter((i) => i.kind === 'fund')).toHaveLength(511)
    expect(UNIVERSE.filter((i) => i.kind === 'crypto')).toHaveLength(15)
  })

  it('has no duplicate tickers across the whole universe', () => {
    const tickers = UNIVERSE.map((i) => i.ticker)
    const seen = new Set<string>()
    const duplicates = tickers.filter((t) => (seen.has(t) ? true : (seen.add(t), false)))
    expect(duplicates).toEqual([])
  })

  it('has valid, fully populated entries', () => {
    for (const item of UNIVERSE) {
      expect(item.ticker).toMatch(/^[A-Za-z0-9][A-Za-z0-9.-]{0,24}$/)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.type.length).toBeGreaterThan(0)
      expect(item.sector.length).toBeGreaterThan(0)
    }
  })
})
