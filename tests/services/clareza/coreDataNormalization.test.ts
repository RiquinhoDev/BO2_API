import {
  calculatePeriodPerformance,
  normalizeCoreAssetSnapshot,
  normalizeCurrency,
  normalizeDate,
} from '../../../src/services/clareza/core/coreDataNormalization'
import {
  CORE_DATASET_CATALOG,
  datasetRequestIdentity,
} from '../../../src/services/clareza/core/coreDatasetCatalog'
import type { CoreAssetKind } from '../../../src/services/clareza/core/coreGeneration.types'

describe('core dataset catalog', () => {
  it('identifies equivalent requests independently of parameter order and API keys', () => {
    const first = datasetRequestIdentity({
      path: '/income-statement',
      symbol: 'AAPL',
      params: { period: 'annual', limit: '6', apikey: 'secret-one' },
    })
    const equivalent = datasetRequestIdentity({
      path: '/income-statement',
      symbol: 'AAPL',
      params: { limit: '6', apikey: 'secret-two', period: 'annual' },
    })

    expect(equivalent).toBe(first)
    expect(datasetRequestIdentity({
      path: '/income-statement',
      symbol: 'AAPL',
      params: { period: 'quarter', limit: '6' },
    })).not.toBe(first)
  })

  it('has unique datasets and explicit asset and consumer coverage', () => {
    expect(new Set(CORE_DATASET_CATALOG.map(dataset => dataset.name)).size)
      .toBe(CORE_DATASET_CATALOG.length)
    for (const dataset of CORE_DATASET_CATALOG) {
      expect(dataset.assetKinds.length).toBeGreaterThan(0)
      expect(dataset.consumers.length).toBeGreaterThan(0)
      expect(dataset.path.startsWith('/')).toBe(true)
    }
  })
})

describe('core data normalization', () => {
  it('normalizes fractions and amounts while preserving zero, missing, and invalid', () => {
    const normalized = normalizeCoreAssetSnapshot({
      ticker: 'AAPL',
      kind: 'stock',
      asOf: '2026-09-01',
      currency: 'usd',
      price: 0,
      changePercentage: null,
      dividendYieldFraction: 0.0125,
      pe: Number.POSITIVE_INFINITY,
      history: [],
      periodStart: '2025-09-01',
      periodEnd: '2026-09-01',
    })

    expect(normalized.currency).toBe('USD')
    expect(normalized.metrics.price).toEqual({
      status: 'available', unit: 'amount', value: 0, currency: 'USD',
    })
    expect(normalized.metrics.change).toEqual({ status: 'missing', unit: 'percent', value: null })
    expect(normalized.metrics.dividendYield).toEqual({ status: 'available', unit: 'percent', value: 1.25 })
    expect(normalized.metrics.pe).toEqual({ status: 'invalid', unit: 'ratio', value: null })
    expect(normalized.metrics.performance12m).toEqual({ status: 'missing', unit: 'percent', value: null })
  })

  it('calculates period performance from boundary prices instead of the annual low', () => {
    const history = [
      { date: '2025-09-01', close: 100 },
      { date: '2026-01-10', close: 50 },
      { date: '2026-09-01', close: 80 },
    ]

    expect(calculatePeriodPerformance(history, '2025-09-01', '2026-09-01')).toEqual({
      status: 'available', unit: 'percent', value: -20,
    })
    expect(calculatePeriodPerformance([...history].reverse(), '2025-09-01', '2026-09-01')).toEqual({
      status: 'available', unit: 'percent', value: -20,
    })
  })

  it('reports partial historical coverage instead of hiding malformed rows', () => {
    const normalized = normalizeCoreAssetSnapshot({
      ticker: 'O', kind: 'stock', asOf: '2026-09-01', currency: 'USD',
      price: 80, changePercentage: 1, dividendYieldFraction: 0.05, pe: 25,
      history: [
        { date: '2025-09-01', close: 100 },
        { date: 'invalid-date', close: 70 },
        { date: '2026-09-01', close: 80 },
      ],
      periodStart: '2025-09-01', periodEnd: '2026-09-01',
    })

    expect(normalized.historyCoverage).toEqual({ validPoints: 2, invalidPoints: 1 })
    expect(normalized.metrics.performance12m.value).toBe(-20)
  })

  it('normalizes strict civil dates and ISO currencies', () => {
    expect(normalizeDate('2024-02-29')).toBe('2024-02-29')
    expect(normalizeDate('2025-02-29')).toBeNull()
    expect(normalizeDate('2026-02-30')).toBeNull()
    expect(normalizeCurrency(' eur ')).toBe('EUR')
    expect(normalizeCurrency('EURO')).toBeNull()
    expect(normalizeCurrency(null)).toBeNull()
  })

  it.each<CoreAssetKind>(['stock', 'fund', 'crypto'])(
    'keeps %s identity with the same normalized metric contract',
    kind => {
      const normalized = normalizeCoreAssetSnapshot({
        ticker: kind === 'crypto' ? 'BTCUSD' : 'TEST',
        kind,
        asOf: '2026-09-01',
        currency: kind === 'crypto' ? 'USD' : 'EUR',
        price: 10,
        changePercentage: 0,
        dividendYieldFraction: kind === 'crypto' ? null : 0,
        pe: kind === 'stock' ? 15 : null,
        history: [
          { date: '2025-09-01', close: 8 },
          { date: '2026-09-01', close: 10 },
        ],
        periodStart: '2025-09-01',
        periodEnd: '2026-09-01',
      })

      expect(normalized.kind).toBe(kind)
      expect(normalized.metrics.performance12m.value).toBe(25)
      expect(normalized.metrics.change.value).toBe(0)
    },
  )
})
