import fixture from '../../fixtures/clareza/comparador-main-contract.json'
import {
  ComparadorPolicyError,
  parseComparadorSymbols,
  searchComparadorStocks,
  selectComparadorStocks,
} from '../../../src/services/clareza/comparador/comparadorPolicy'

describe('parseComparadorSymbols', () => {
  it('normalizes, deduplicates, and preserves the first requested order', () => {
    expect(parseComparadorSymbols(' aapl, brk.b, AAPL, o ', 4)).toEqual(['AAPL', 'BRK-B', 'O'])
  })

  it('rejects empty or invalid input with a typed domain error', () => {
    expect(() => parseComparadorSymbols(' ,invalid/ticker ', 4)).toThrow(ComparadorPolicyError)
    expect(() => parseComparadorSymbols(' ,invalid/ticker ', 4)).toThrow('Sem símbolos válidos.')
  })

  it('rejects more than four comparison symbols instead of silently dropping one', () => {
    expect(() => parseComparadorSymbols('AAPL,MSFT,NVDA,AMZN,GOOG', 4)).toThrow('Limite de 4 símbolos excedido.')
  })

  it('rejects more than ten manually refreshed symbols', () => {
    expect(() => parseComparadorSymbols('A,B,C,D,E,F,G,H,I,J,K', 10)).toThrow('Limite de 10 símbolos excedido.')
  })
})

describe('selectComparadorStocks', () => {
  it('keeps the cache timestamp and returns a missing cached symbol in the public shape', () => {
    expect(selectComparadorStocks(fixture.snapshot, ['AAPL', 'MSFT'])).toEqual({
      count: 2,
      updated: '2026-08-11T09:30:00.000Z',
      companies: [
        fixture.snapshot.stocks.AAPL,
        { ticker: 'MSFT', error: 'MSFT ainda não está disponível no Comparador.' },
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
})
