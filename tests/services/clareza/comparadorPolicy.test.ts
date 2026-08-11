import fixture from '../../fixtures/clareza/comparador-main-contract.json'
import {
  ComparadorPolicyError,
  parseComparadorSymbols,
  searchComparadorStocks,
  selectComparadorStocks,
} from '../../../src/services/clareza/comparador/comparadorPolicy'
import type { ComparadorSnapshot, ComparadorStock } from '../../../src/services/clareza/comparador/comparador.types'

function stock(overrides: Partial<ComparadorStock> = {}): ComparadorStock {
  return {
    ticker: 'BASE',
    name: 'Base Company',
    image: null,
    sector: null,
    industry: null,
    country: null,
    currency: 'USD',
    exchange: null,
    isReit: false,
    price: null,
    change: null,
    perf12m: null,
    marketCap: null,
    beta: null,
    pe: null,
    peg: null,
    ps: null,
    pb: null,
    evEbitda: null,
    pFfo: null,
    grossMargin: null,
    netMargin: null,
    roe: null,
    roic: null,
    fcfYield: null,
    debtEquity: null,
    debtEbitda: null,
    dividendYield: null,
    payoutRatio: null,
    ffoPayout: null,
    analystConsensus: null,
    strongBuy: null,
    buy: null,
    hold: null,
    sell: null,
    strongSell: null,
    targetConsensus: null,
    upside: null,
    updated: '2026-08-11T09:30:00.000Z',
    ...overrides,
  }
}

function snapshot(stocks: Record<string, ComparadorStock>): ComparadorSnapshot {
  return { updated: '2026-08-11T09:30:00.000Z', stocks }
}

describe('parseComparadorSymbols', () => {
  it('normalizes, deduplicates, and preserves the first requested order', () => {
    expect(parseComparadorSymbols(' aapl, brk.b, AAPL, o ', 4)).toEqual(['AAPL', 'BRK-B', 'O'])
  })

  it('rejects empty or invalid input with a typed domain error', () => {
    expect(() => parseComparadorSymbols(' ,invalid/ticker ', 4)).toThrow(ComparadorPolicyError)
    expect(() => parseComparadorSymbols(' ,invalid/ticker ', 4)).toThrow('Sem s\u00edmbolos v\u00e1lidos.')
  })

  it('truncates comparison input after four valid unique symbols', () => {
    expect(parseComparadorSymbols('AAPL,MSFT,NVDA,AMZN,GOOG', 4)).toEqual(['AAPL', 'MSFT', 'NVDA', 'AMZN'])
  })

  it('truncates manual refresh input after ten valid unique symbols', () => {
    expect(parseComparadorSymbols('A,B,C,D,E,F,G,H,I,J,K', 10)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
  })
})

describe('selectComparadorStocks', () => {
  it('keeps the cache timestamp and returns a missing cached symbol in the public shape', () => {
    expect(selectComparadorStocks(fixture.snapshot, ['AAPL', 'MSFT'])).toEqual({
      count: 2,
      updated: '2026-08-11T09:30:00.000Z',
      companies: [
        fixture.snapshot.stocks.AAPL,
        { ticker: 'MSFT', error: 'MSFT ainda n\u00e3o est\u00e1 dispon\u00edvel no Comparador.' },
      ],
    })
  })
})

describe('searchComparadorStocks', () => {
  it('searches ticker and name aliases case-insensitively', () => {
    expect(searchComparadorStocks(fixture.snapshot, 'InCoMe')).toEqual({
      query: 'INCOME',
      count: 1,
      results: [{
        symbol: 'O',
        name: 'Realty Income Corporation',
        sector: 'Real Estate',
        exchange: 'NYSE',
        image: null,
        isReit: true,
      }],
    })
  })

  it('ranks exact ticker, ticker prefix, name prefix, then contains matches', () => {
    const stocks = snapshot({
      AAPL: stock({ ticker: 'AAPL', name: 'Apple Inc.' }),
      AAPX: stock({ ticker: 'AAPX', name: 'Another Company' }),
      N1: stock({ ticker: 'N1', name: 'Aap Ventures' }),
      ZZA: stock({ ticker: 'ZZA', name: 'Beta Aap Holdings' }),
    })

    expect(searchComparadorStocks(stocks, 'aap').results.map((entry) => entry.symbol)).toEqual(['AAPL', 'AAPX', 'N1', 'ZZA'])
  })

  it('uses the snapshot record key as the symbol and falls back to it for an empty legacy name', () => {
    const result = searchComparadorStocks(snapshot({
      ZETA: stock({ ticker: 'WRONG', name: '' }),
      ALFA: stock({ ticker: 'ALSO-WRONG', name: 'Zeta Partners' }),
    }), 'zeta')

    expect(result).toEqual({
      query: 'ZETA',
      count: 2,
      results: [
        { symbol: 'ZETA', name: 'ZETA', sector: null, exchange: null, image: null, isReit: false },
        { symbol: 'ALFA', name: 'Zeta Partners', sector: null, exchange: null, image: null, isReit: false },
      ],
    })
  })

  it('sorts equal-ranked matches alphabetically by record key', () => {
    const result = searchComparadorStocks(snapshot({
      ZULU: stock({ ticker: 'WRONG', name: 'Match Company' }),
      ALFA: stock({ ticker: 'ALSO-WRONG', name: 'Match Company' }),
    }), 'match')

    expect(result.results.map((entry) => entry.symbol)).toEqual(['ALFA', 'ZULU'])
  })

  it('returns all cached stocks for an empty search query', () => {
    expect(searchComparadorStocks(fixture.snapshot, '')).toEqual({
      query: '',
      count: 2,
      results: [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          sector: 'Technology',
          exchange: 'NASDAQ',
          image: 'https://cdn.example.test/aapl.png',
          isReit: false,
        },
        {
          symbol: 'O',
          name: 'Realty Income Corporation',
          sector: 'Real Estate',
          exchange: 'NYSE',
          image: null,
          isReit: true,
        },
      ],
    })
  })

  it('reports the count before applying the twenty-result search limit', () => {
    const stocks: Record<string, ComparadorStock> = {}
    for (let index = 0; index < 21; index += 1) {
      const symbol = `MATCH${String(index).padStart(2, '0')}`
      stocks[symbol] = stock({ ticker: symbol, name: `Match ${index}` })
    }

    const result = searchComparadorStocks(snapshot(stocks), 'match')

    expect(result.count).toBe(21)
    expect(result.results).toHaveLength(20)
    expect(result.results[0]?.symbol).toBe('MATCH00')
    expect(result.results[19]?.symbol).toBe('MATCH19')
  })
})
