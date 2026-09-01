import { CoreMasterMetricsFetcher } from '../../../src/services/clareza/core/coreMasterMetrics'

describe('canonical core master metrics', () => {
  it('collects and derives every common PHP master/scoring input for a stock', async () => {
    const responses: Record<string, unknown> = {
      '/profile': [{ price: 100, changePercentage: 1, currency: 'USD', exchangeShortName: 'NASDAQ' }],
      '/ratios-ttm': [{
        priceToEarningsRatioTTM: 20, priceToSalesRatioTTM: 4, priceToBookRatioTTM: 5,
        netProfitMarginTTM: 0.2, grossProfitMarginTTM: 0.5, dividendYieldTTM: 0.01,
        dividendPayoutRatioTTM: 0.3, debtToEquityRatioTTM: 1.2, interestCoverageRatioTTM: 0,
      }],
      '/key-metrics-ttm': [{
        evToEBITDATTM: 12, freeCashFlowYieldTTM: 0.08, returnOnEquityTTM: 0.25,
        returnOnInvestedCapitalTTM: 0.18, netDebtToEBITDATTM: 1.5,
      }],
      '/stock-price-change': [{ '1Y': -10, '1D': 1, '5D': 2, '1M': 3, '3M': 4 }],
      '/ratios': [
        { priceToEarningsRatio: 10, priceToSalesRatio: 2, priceToBookRatio: 3, netProfitMargin: 0.1 },
        { priceToEarningsRatio: 20, priceToSalesRatio: 4, priceToBookRatio: 5, netProfitMargin: 0.2 },
        { priceToEarningsRatio: 30, priceToSalesRatio: 6, priceToBookRatio: 7, netProfitMargin: 0.3 },
      ],
      '/key-metrics': [{ evToEBITDA: 10 }, { evToEBITDA: 20 }, { evToEBITDA: 30 }],
      '/income-statement': [
        { fiscalYear: '2025', eps: 4, revenue: 200, netIncome: 100, interestExpense: 0 },
        { fiscalYear: '2024', eps: 2, revenue: 150 },
        { fiscalYear: '2023', eps: 1, revenue: 100 },
      ],
      '/levered-discounted-cash-flow': [{ dcf: 120 }],
      '/cash-flow-statement': [{ freeCashFlow: 150 }],
    }
    const get = jest.fn(async (path: string) => responses[path] ?? [])
    const fetcher = new CoreMasterMetricsFetcher({ get }, {
      now: () => new Date('2026-09-01T12:00:00.000Z'),
    })

    const result = await fetcher.fetchItem({
      ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology',
    })

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      '/profile', '/ratios-ttm', '/key-metrics-ttm', '/stock-price-change',
      '/ratios', '/key-metrics', '/income-statement',
      '/levered-discounted-cash-flow', '/cash-flow-statement',
    ])
    expect(result).toMatchObject({
      price: 100, perf12m: -10, perf3m: 4,
      roic: 18, interestCoverage: null, fcfConversion: 150,
      histMedians: { pe: 20, ps: 4, pb: 5, evEbitda: 20 },
      epsCagr: 100, revenueCagr: 41.42,
      epsYoY: 100, revenueYoY: 33.33, epsTurnaround: false,
      growthYears: 2, latestFiscalYear: '2025', dcf: 120,
      marginStability: 46.9,
    })
  })

  it('uses the shared annual statements to derive REIT FFO without duplicate calls', async () => {
    const responses: Record<string, unknown> = {
      '/profile': [{ price: 100 }],
      '/income-statement': [{
        fiscalYear: '2025', netIncome: 1000, depreciationAndAmortization: 500,
        weightedAverageShsOut: 100,
      }],
      '/cash-flow-statement': [{ freeCashFlow: 900, netDividendsPaid: -300 }],
    }
    const get = jest.fn(async (path: string) => responses[path] ?? [])
    const fetcher = new CoreMasterMetricsFetcher({ get }, { now: () => new Date() })

    const result = await fetcher.fetchItem({
      ticker: 'O', name: 'Realty Income', kind: 'stock', type: 'reit', bucket: 'reit', sector: 'Real Estate',
    })

    expect(result).toMatchObject({ pFfo: 6.67, ffoYield: 15, ffoPayoutRatio: 20 })
    expect(get.mock.calls.filter(([path]) => path === '/income-statement')).toHaveLength(1)
    expect(get.mock.calls.filter(([path]) => path === '/cash-flow-statement')).toHaveLength(1)
  })
})
