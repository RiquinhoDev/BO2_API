import {
  analyzeCarteiraPortfolio,
  parseCarteiraAnalyzeSymbols,
  type CoreCarteiraAnalyzeDependencies,
  type CoreCarteiraAnalyzeEntry,
} from '../../../src/services/clareza/core/coreCarteiraAnalyze'

const universe = [
  { ticker: 'AAPL', kind: 'stock' as const },
  { ticker: 'O', kind: 'stock' as const },
  { ticker: 'VWCE.DE', kind: 'fund' as const },
  { ticker: 'BTC-USD', kind: 'crypto' as const },
]

function deps(overrides: Partial<CoreCarteiraAnalyzeDependencies> = {}): {
  dependencies: CoreCarteiraAnalyzeDependencies
  fmp: jest.Mock
  store: Map<string, CoreCarteiraAnalyzeEntry>
  sets: jest.Mock
} {
  const store = new Map<string, CoreCarteiraAnalyzeEntry>()
  const fmp = jest.fn(async (path: string) => {
    if (path === '/income-statement') return [{ revenue: 100 }]
    if (path === '/income-statement-growth') return [{ growthRevenue: 0.1 }]
    if (path === '/earnings') return [{ date: '2026-07-20', epsActual: 1.6 }]
    return null
  })
  const sets = jest.fn(async (key: string, value: CoreCarteiraAnalyzeEntry) => { store.set(key, value) })
  return {
    store,
    fmp,
    sets,
    dependencies: {
      fmp: { get: fmp },
      cache: { get: async key => store.get(key) ?? null, set: sets },
      universe,
      ttlSeconds: 21600,
      ...overrides,
    },
  }
}

describe('core Carteira analyze (portfolio results history)', () => {
  it('parses, uppercases, dedupes and caps at 40 symbols', () => {
    expect(parseCarteiraAnalyzeSymbols(' aapl , AAPL , msft ')).toEqual(['AAPL', 'MSFT'])
    const many = Array.from({ length: 60 }, (_, index) => `T${index}`).join(',')
    expect(parseCarteiraAnalyzeSymbols(many)).toHaveLength(40)
  })

  it('fetches income, income-growth and earnings for a stock and caches them', async () => {
    const { dependencies, fmp, store } = deps()
    const { results } = await analyzeCarteiraPortfolio('AAPL', dependencies)

    expect(fmp).toHaveBeenCalledWith('/income-statement', { symbol: 'AAPL', period: 'annual', limit: '4' })
    expect(fmp).toHaveBeenCalledWith('/income-statement-growth', { symbol: 'AAPL', period: 'annual', limit: '4' })
    expect(fmp).toHaveBeenCalledWith('/earnings', { symbol: 'AAPL', limit: '8' })
    expect(results.AAPL).toEqual({
      income: [{ revenue: 100 }],
      incomeGrowth: [{ growthRevenue: 0.1 }],
      earnings: [{ date: '2026-07-20', epsActual: 1.6 }],
    })
    expect(store.get('clareza:carteira:analyze:AAPL')).toEqual(results.AAPL)
  })

  it('returns empty history for ETFs and crypto without calling the FMP', async () => {
    const { dependencies, fmp } = deps()
    const { results } = await analyzeCarteiraPortfolio('VWCE.DE,BTC-USD', dependencies)

    expect(results['VWCE.DE']).toEqual({ income: [], incomeGrowth: [], earnings: [] })
    expect(results['BTC-USD']).toEqual({ income: [], incomeGrowth: [], earnings: [] })
    expect(fmp).not.toHaveBeenCalled()
  })

  it('serves a cached entry without re-fetching', async () => {
    const { dependencies, fmp, store } = deps()
    store.set('clareza:carteira:analyze:AAPL', { income: [{ cached: true }], incomeGrowth: [], earnings: [] })

    const { results } = await analyzeCarteiraPortfolio('AAPL', dependencies)

    expect(results.AAPL).toEqual({ income: [{ cached: true }], incomeGrowth: [], earnings: [] })
    expect(fmp).not.toHaveBeenCalled()
  })

  it('treats a failed FMP response as an empty dataset', async () => {
    const { dependencies } = deps({ fmp: { get: async () => null } })
    const { results } = await analyzeCarteiraPortfolio('AAPL', dependencies)

    expect(results.AAPL).toEqual({ income: [], incomeGrowth: [], earnings: [] })
  })
})
