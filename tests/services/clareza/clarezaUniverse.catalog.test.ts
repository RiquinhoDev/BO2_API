import {
  CLAREZA_UNIVERSE,
  resolveEditorialUniverse,
  selectComparadorUniverse,
  selectEarningsUniverse,
  selectPortfolioUniverse,
  selectRadarUniverse,
  selectRaioxUniverse,
} from '../../../src/services/clareza/universe/clarezaUniverse.catalog'
import { ClarezaAssetSchema } from '../../../src/services/clareza/universe/clarezaUniverse.types'

describe('Clareza 2.0 universe catalog', () => {
  it('loads the complete unique snapshot with explicit classifications', () => {
    expect(CLAREZA_UNIVERSE).toHaveLength(879)
    expect(CLAREZA_UNIVERSE.filter(({ kind }) => kind === 'stock')).toHaveLength(347)
    expect(CLAREZA_UNIVERSE.filter(({ kind }) => kind === 'fund')).toHaveLength(517)
    expect(CLAREZA_UNIVERSE.filter(({ kind }) => kind === 'crypto')).toHaveLength(15)

    const tickers = CLAREZA_UNIVERSE.map(({ ticker }) => ticker)
    expect(new Set(tickers).size).toBe(tickers.length)
    expect(tickers).toEqual(expect.arrayContaining(['AAPL', 'THEON.AS', 'NDA-FI.HE']))

    for (const asset of CLAREZA_UNIVERSE) {
      expect(asset.ticker).toMatch(/^[A-Za-z0-9][A-Za-z0-9.-]{0,24}$/)
      expect(asset.name.length).toBeGreaterThan(0)
      expect(['stock', 'fund', 'crypto']).toContain(asset.kind)
      expect(['growth', 'value', 'reit', 'etf', 'cripto']).toContain(asset.type)
      expect(['growth', 'value', 'reit', 'financials', 'etf', 'cripto'])
        .toContain(asset.bucket)
      expect(asset.sector.length).toBeGreaterThan(0)
    }
  })

  it('applies each tool eligibility without copying catalog data', () => {
    expect(selectRadarUniverse()).toHaveLength(347)
    expect(selectEarningsUniverse()).toHaveLength(347)
    expect(selectRaioxUniverse()).toHaveLength(303)
    expect(selectComparadorUniverse()).toHaveLength(303)
    expect(selectPortfolioUniverse()).toHaveLength(879)

    expect(selectRadarUniverse().filter(({ type }) => type === 'reit')).toHaveLength(44)
    expect(selectRaioxUniverse().some(({ type }) => type === 'reit')).toBe(false)
    expect(selectComparadorUniverse().some(({ type }) => type === 'reit')).toBe(false)
  })

  it('rejects classifications that contradict the asset kind', () => {
    const base = { ticker: 'EXM', name: 'Example', sector: 'Technology' }

    expect(ClarezaAssetSchema.safeParse({
      ...base,
      kind: 'fund',
      type: 'growth',
      bucket: 'growth',
    }).success).toBe(false)
    expect(ClarezaAssetSchema.safeParse({
      ...base,
      kind: 'crypto',
      type: 'cripto',
      bucket: 'etf',
    }).success).toBe(false)
    expect(ClarezaAssetSchema.safeParse({
      ...base,
      kind: 'stock',
      type: 'reit',
      bucket: 'value',
    }).success).toBe(false)
  })

  it('resolves editorial tickers in order without inventing aliases', () => {
    const result = resolveEditorialUniverse(['aapl', 'UNKNOWN', 'AAPL', 'o'])

    expect(result.assets.map(({ ticker }) => ticker)).toEqual(['AAPL', 'AAPL', 'O'])
    expect(result.missing).toEqual(['UNKNOWN'])
  })
})
