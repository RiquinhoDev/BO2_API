import * as facade from '../../../src/services/clareza/clarezaFmpService'
import * as data from '../../../src/services/clareza/clarezaFmpData.service'
import * as reit from '../../../src/services/clareza/clarezaFmpReit.service'
import * as stock from '../../../src/services/clareza/clarezaFmpStock.service'
import { UNIVERSE } from '../../../src/services/clareza/clarezaFmpUniverse'

test('Clareza FMP facade delegates to focused data and analysis owners', () => {
  expect(facade.refreshClarezaData).toBe(data.refreshClarezaData)
  expect(facade.getClarezaData).toBe(data.getClarezaData)
  expect(facade.getReitAnalysis).toBe(reit.getReitAnalysis)
  expect(facade.getReitValuation).toBe(reit.getReitValuation)
  expect(facade.getStockAnalysis).toBe(stock.getStockAnalysis)
  expect(facade.UNIVERSE).toBe(UNIVERSE)
})
