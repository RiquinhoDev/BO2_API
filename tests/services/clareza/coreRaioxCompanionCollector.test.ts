import { CoreRaioxCompanionCollector } from '../../../src/services/clareza/core/coreRaioxCompanionCollector'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

const assets: readonly ClarezaAsset[] = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
  { ticker: 'ARE', name: 'Alexandria', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate' },
  { ticker: 'VUSA.L', name: 'Vanguard', kind: 'fund', type: 'etf', bucket: 'etf', sector: 'ETF' },
]

describe('core Raio-X companion collector', () => {
  it('collects only tool-specific datasets for non-REIT stocks', async () => {
    const calls: Array<{ path: string; symbol?: string }> = []
    const get = jest.fn(async (path: string, params: Readonly<Record<string, string>>) => {
      calls.push({ path, symbol: params.symbol })
      if (path === '/profile') return [{ price: 200, ceo: 'CEO', country: 'US', industry: 'Hardware' }]
      if (path === '/analyst-estimates') return [{ date: '2027-09-30', epsAvg: 10 }]
      if (path === '/stock-peers') return [{ peersList: ['MSFT'] }]
      if (path === '/ratios-ttm') return [{ grossProfitMarginTTM: 0.7, netProfitMarginTTM: 0.3 }]
      if (path === '/grades-consensus') return [{ consensus: 'Buy' }]
      if (path === '/price-target-consensus') return [{ targetConsensus: 220 }]
      if (path === '/sector-pe-snapshot') return [{ sector: 'Technology', pe: 25 }]
      return []
    })
    const collector = new CoreRaioxCompanionCollector({ get }, assets, {
      concurrency: 2,
      now: () => new Date('2026-09-02T03:30:00.000Z'),
    })

    const result = await collector.collect('generation-a')

    expect(result.generationId).toBe('generation-a')
    expect(Object.keys(result.companions)).toEqual(['AAPL'])
    expect(result.companions.AAPL).toMatchObject({
      profileExtra: { ceo: 'CEO', country: 'US', industry: 'Hardware' },
      forwardPe: 20,
      gradesConsensus: { consensus: 'Buy' },
      priceTargetConsensus: { targetConsensus: 220 },
      peerRatios: { MSFT: { g: 0.7, n: 0.3 } },
      updated: '2026-09-02T03:30:00.000Z',
    })
    expect(result.sectorPe).toEqual([{ sector: 'Technology', pe: 25 }])
    expect(calls.some(call => call.symbol === 'ARE' || call.symbol === 'VUSA.L')).toBe(false)
    expect(calls.filter(call => call.path === '/ratios-ttm').map(call => call.symbol)).toEqual(['MSFT'])
    expect(calls.map(call => call.path)).not.toEqual(expect.arrayContaining([
      '/key-metrics-ttm', '/levered-discounted-cash-flow', '/discounted-cash-flow',
    ]))
  })

  it('contains one company failure and keeps the generation publishable for other companions', async () => {
    const universe = assets.concat({
      ticker: 'MSFT', name: 'Microsoft', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology',
    })
    const collector = new CoreRaioxCompanionCollector({
      get: async (path, params) => {
        if (params.symbol === 'MSFT' && path === '/profile') throw Object.assign(new Error('down'), { code: 'FMP_DOWN' })
        return path === '/profile' ? [{ price: 100 }] : []
      },
    }, universe, { concurrency: 2, now: () => new Date('2026-09-02T03:30:00.000Z') })

    const result = await collector.collect('generation-a')
    expect(Object.keys(result.companions)).toEqual(['AAPL'])
    expect(result.errors).toEqual([{ ticker: 'MSFT', code: 'FMP_DOWN' }])
  })
})
