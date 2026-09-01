import { CoreMasterCollector } from '../../../src/services/clareza/core/coreMasterCollector'
import { CLAREZA_UNIVERSE } from '../../../src/services/clareza/universe/clarezaUniverse.catalog'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

const metrics = (price: number | null) => ({
  price,
  change: null,
  perf12m: null,
  dividendYield: null,
  currency: null,
  exchange: null,
  updated: '2026-09-01T12:00:00.000Z',
})

describe('canonical core master collector', () => {
  it('processes every canonical asset exactly once and preserves universe order', async () => {
    const fetchItem = jest.fn(async (_asset: ClarezaAsset) => metrics(1))
    const report = await new CoreMasterCollector(
      { fetchItem },
      CLAREZA_UNIVERSE,
      { concurrency: 24 },
    ).collect()

    expect(fetchItem).toHaveBeenCalledTimes(879)
    expect(fetchItem.mock.calls.map(([asset]) => asset.ticker).sort()).toEqual(
      CLAREZA_UNIVERSE.map(asset => asset.ticker).sort(),
    )
    expect(report.records.map(record => record.asset.ticker)).toEqual(
      CLAREZA_UNIVERSE.map(asset => asset.ticker),
    )
    expect(report.coverage).toEqual({
      total: 879,
      available: 879,
      missing: 0,
      failed: 0,
      byKind: {
        stock: { total: 347, available: 347, missing: 0, failed: 0 },
        fund: { total: 517, available: 517, missing: 0, failed: 0 },
        crypto: { total: 15, available: 15, missing: 0, failed: 0 },
      },
    })
  })

  it('reports missing data and failures explicitly without deleting known assets', async () => {
    const universe: ClarezaAsset[] = [
      { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
      { ticker: 'VWCE.DE', name: 'Vanguard', kind: 'fund', type: 'etf', bucket: 'etf', sector: 'Fund' },
      { ticker: 'BTCUSD', name: 'Bitcoin', kind: 'crypto', type: 'cripto', bucket: 'cripto', sector: 'Crypto' },
    ]
    const fetchItem = jest.fn(async (asset: ClarezaAsset) => {
      if (asset.kind === 'fund') return metrics(null)
      if (asset.kind === 'crypto') throw Object.assign(new Error('provider down'), { code: 'FMP_UNAVAILABLE' })
      return metrics(200)
    })

    const report = await new CoreMasterCollector(
      { fetchItem },
      universe,
      { concurrency: 2 },
    ).collect()

    expect(report.records).toEqual([
      expect.objectContaining({ asset: universe[0], status: 'available', data: expect.objectContaining({ price: 200 }) }),
      { asset: universe[1], status: 'missing', data: null },
      { asset: universe[2], status: 'failed', data: null, errorCode: 'FMP_UNAVAILABLE' },
    ])
    expect(report.coverage).toMatchObject({ total: 3, available: 1, missing: 1, failed: 1 })
  })

  it('rejects duplicate tickers and invalid concurrency before any provider call', async () => {
    const fetchItem = jest.fn(async (_asset: ClarezaAsset) => metrics(1))
    const duplicate = [CLAREZA_UNIVERSE[0], { ...CLAREZA_UNIVERSE[0] }]

    expect(() => new CoreMasterCollector({ fetchItem }, duplicate, { concurrency: 2 }))
      .toThrow('unique tickers')
    expect(() => new CoreMasterCollector({ fetchItem }, CLAREZA_UNIVERSE, { concurrency: 0 }))
      .toThrow('concurrency')
    expect(fetchItem).not.toHaveBeenCalled()
  })
})
