import {
  CoreHistoryEnqueueCoordinator,
  PortfolioHistoryRequestLimitError,
  planPortfolioHistoryRequest,
} from '../../../src/services/clareza/core/corePortfolioHistoryPlan'

describe('core portfolio history plan', () => {
  const universe = [
    { ticker: 'AAPL', kind: 'stock' as const },
    { ticker: 'O', kind: 'reit' as const },
    { ticker: 'VWCE.DE', kind: 'fund' as const },
    { ticker: 'BTC-USD', kind: 'crypto' as const },
  ]
  const availability = [
    { ticker: 'AAPL', annualIncome: true, quarterlyIncome: true, earnings: true },
    { ticker: 'O', annualIncome: true, quarterlyIncome: false, earnings: true },
  ]

  it('normalizes and deduplicates symbols while rejecting unknown and unsupported assets', () => {
    const plan = planPortfolioHistoryRequest(
      ' aapl, AAPL, vwce.de, btc-usd, missing ', universe, availability,
      { maxSymbols: 5, maxInputLength: 100, missingDatasetAction: 'unavailable' },
    )

    expect(plan.requested).toEqual(['AAPL', 'VWCE.DE', 'BTC-USD', 'MISSING'])
    expect(plan.ready).toEqual(['AAPL'])
    expect(plan.pending).toEqual([])
    expect(plan.rejected).toEqual([
      { ticker: 'VWCE.DE', reason: 'unsupported-kind' },
      { ticker: 'BTC-USD', reason: 'unsupported-kind' },
      { ticker: 'MISSING', reason: 'unknown-symbol' },
    ])
  })

  it('keeps partial histories unavailable unless asynchronous collection is explicit', () => {
    const unavailable = planPortfolioHistoryRequest(
      'O', universe, availability,
      { maxSymbols: 2, maxInputLength: 20, missingDatasetAction: 'unavailable' },
    )
    const enqueued = planPortfolioHistoryRequest(
      'O', universe, availability,
      { maxSymbols: 2, maxInputLength: 20, missingDatasetAction: 'enqueue' },
    )

    expect(unavailable.rejected).toEqual([{ ticker: 'O', reason: 'datasets-unavailable' }])
    expect(enqueued.pending).toEqual(['O'])
    expect(enqueued.ready).toEqual([])
  })

  it('fails closed before planning oversized requests', () => {
    expect(() => planPortfolioHistoryRequest(
      'AAPL,O,VWCE.DE', universe, availability,
      { maxSymbols: 2, maxInputLength: 100, missingDatasetAction: 'enqueue' },
    )).toThrow(PortfolioHistoryRequestLimitError)
    expect(() => planPortfolioHistoryRequest(
      'AAPL', universe, availability,
      { maxSymbols: 2, maxInputLength: 3, missingDatasetAction: 'enqueue' },
    )).toThrow(PortfolioHistoryRequestLimitError)
  })

  it('deduplicates concurrent collection for the same normalized ticker', async () => {
    let release: (() => void) | undefined
    let callCount = 0
    const enqueue = jest.fn(() => {
      callCount += 1
      if (callCount > 1) return Promise.resolve()
      return new Promise<void>(resolve => { release = resolve })
    })
    const coordinator = new CoreHistoryEnqueueCoordinator(enqueue)

    const first = coordinator.enqueue(' aapl ')
    const second = coordinator.enqueue('AAPL')
    expect(enqueue).toHaveBeenCalledTimes(1)
    release?.()
    await Promise.all([first, second])
    await coordinator.enqueue('AAPL')
    expect(enqueue).toHaveBeenCalledTimes(2)
  })
})
