import * as facade from '../../src/controllers/guru.snapshot.controller'
import * as crud from '../../src/controllers/guruSnapshots/crud.controller'
import * as analytics from '../../src/controllers/guruSnapshots/analytics.controller'
import * as history from '../../src/controllers/guruSnapshots/history.controller'

test('Guru snapshot facade delegates every handler and policy to focused owners', () => {
  expect(facade.createSnapshot).toBe(crud.createSnapshot)
  expect(facade.updateSnapshot).toBe(crud.updateSnapshot)
  expect(facade.listSnapshots).toBe(crud.listSnapshots)
  expect(facade.getSnapshot).toBe(crud.getSnapshot)
  expect(facade.deleteSnapshot).toBe(crud.deleteSnapshot)
  expect(facade.deleteAllSnapshots).toBe(crud.deleteAllSnapshots)
  expect(facade.getChurnFromSnapshots).toBe(analytics.getChurnFromSnapshots)
  expect(facade.createHistoricalSnapshots).toBe(history.createHistoricalSnapshots)
  expect(facade.mapStatus).toBe(history.mapStatus)
})
